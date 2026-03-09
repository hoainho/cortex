// Use vi.hoisted so mock fns are available inside vi.mock factory
const { mockGet, mockRun, mockIsEncryptionAvailable, mockEncryptString, mockDecryptString, mockRandomUUID } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockRun: vi.fn(),
  mockIsEncryptionAvailable: vi.fn().mockReturnValue(true),
  mockEncryptString: vi.fn().mockReturnValue(Buffer.from('encrypted-base64')),
  mockDecryptString: vi.fn().mockReturnValue('decrypted-token'),
  mockRandomUUID: vi.fn().mockReturnValue('test-uuid-1234')
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  }
}))

vi.mock('crypto', () => ({
  randomUUID: mockRandomUUID
}))

vi.mock('../../electron/services/db', () => ({
  getDb: vi.fn().mockReturnValue({}),
  atlassianConfigQueries: {
    getByProject: vi.fn().mockReturnValue({ get: mockGet }),
    upsert: vi.fn().mockReturnValue({ run: mockRun }),
    deleteByProject: vi.fn().mockReturnValue({ run: mockRun })
  }
}))

import {
  getProjectAtlassianConfig,
  setProjectAtlassianConfig,
  clearProjectAtlassianConfig,
  hasProjectAtlassianConfig
} from '../../electron/services/atlassian-config-service'

describe('atlassian-config-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEncryptionAvailable.mockReturnValue(true)
  })

  describe('getProjectAtlassianConfig', () => {
    it('returns null when no config found', () => {
      mockGet.mockReturnValue(undefined)
      const result = getProjectAtlassianConfig('proj-1')
      expect(result).toBeNull()
      expect(mockGet).toHaveBeenCalledWith('proj-1')
    })

    it('returns decrypted config when encryption available', () => {
      mockGet.mockReturnValue({
        id: 'cfg-1',
        project_id: 'proj-1',
        site_url: 'https://mysite.atlassian.net',
        email: 'user@test.com',
        api_token_encrypted: Buffer.from('encrypted-token').toString('base64'),
        updated_at: Date.now()
      })
      mockDecryptString.mockReturnValue('my-secret-token')

      const result = getProjectAtlassianConfig('proj-1')

      expect(result).toEqual({
        siteUrl: 'https://mysite.atlassian.net',
        email: 'user@test.com',
        apiToken: 'my-secret-token'
      })
      expect(mockDecryptString).toHaveBeenCalled()
    })

    it('returns raw token when encryption not available', () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      mockGet.mockReturnValue({
        id: 'cfg-1',
        project_id: 'proj-1',
        site_url: 'https://mysite.atlassian.net',
        email: 'user@test.com',
        api_token_encrypted: 'raw-plain-token',
        updated_at: Date.now()
      })

      const result = getProjectAtlassianConfig('proj-1')

      expect(result).toEqual({
        siteUrl: 'https://mysite.atlassian.net',
        email: 'user@test.com',
        apiToken: 'raw-plain-token'
      })
      expect(mockDecryptString).not.toHaveBeenCalled()
    })

    it('returns null on decryption error', () => {
      mockGet.mockReturnValue({
        id: 'cfg-1',
        project_id: 'proj-1',
        site_url: 'https://mysite.atlassian.net',
        email: 'user@test.com',
        api_token_encrypted: 'corrupted-data',
        updated_at: Date.now()
      })
      mockDecryptString.mockImplementation(() => { throw new Error('Decryption failed') })

      const result = getProjectAtlassianConfig('proj-1')
      expect(result).toBeNull()
    })
  })

  describe('setProjectAtlassianConfig', () => {
    it('encrypts token when encryption available', () => {
      const encryptedBuf = Buffer.from('encrypted-result')
      mockEncryptString.mockReturnValue(encryptedBuf)

      setProjectAtlassianConfig('proj-1', 'https://site.atlassian.net', 'user@test.com', 'my-token')

      expect(mockEncryptString).toHaveBeenCalledWith('my-token')
      expect(mockRun).toHaveBeenCalledWith(
        'test-uuid-1234',
        'proj-1',
        'https://site.atlassian.net',
        'user@test.com',
        encryptedBuf.toString('base64'),
        expect.any(Number)
      )
    })

    it('stores raw token when encryption not available', () => {
      mockIsEncryptionAvailable.mockReturnValue(false)

      setProjectAtlassianConfig('proj-1', 'https://site.atlassian.net', 'user@test.com', 'my-raw-token')

      expect(mockEncryptString).not.toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalledWith(
        'test-uuid-1234',
        'proj-1',
        'https://site.atlassian.net',
        'user@test.com',
        'my-raw-token',
        expect.any(Number)
      )
    })

    it('generates UUID for config id', () => {
      mockEncryptString.mockReturnValue(Buffer.from('enc'))

      setProjectAtlassianConfig('proj-1', 'https://site.atlassian.net', 'user@test.com', 'token')

      expect(mockRandomUUID).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalledWith(
        'test-uuid-1234',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Number)
      )
    })
  })

  describe('clearProjectAtlassianConfig', () => {
    it('calls deleteByProject with correct projectId', () => {
      clearProjectAtlassianConfig('proj-42')

      expect(mockRun).toHaveBeenCalledWith('proj-42')
    })
  })

  describe('hasProjectAtlassianConfig', () => {
    it('returns true when config exists', () => {
      mockGet.mockReturnValue({
        id: 'cfg-1',
        project_id: 'proj-1',
        site_url: 'https://site.atlassian.net',
        email: 'user@test.com',
        api_token_encrypted: 'enc',
        updated_at: Date.now()
      })

      expect(hasProjectAtlassianConfig('proj-1')).toBe(true)
    })

    it('returns false when no config', () => {
      mockGet.mockReturnValue(undefined)

      expect(hasProjectAtlassianConfig('proj-1')).toBe(false)
    })
  })
})
