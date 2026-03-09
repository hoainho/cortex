import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../../src/components/ui/Button'
import { Input } from '../../src/components/ui/Input'
import { Modal } from '../../src/components/ui/Modal'
import { Toggle } from '../../src/components/ui/Toggle'
import { Tooltip } from '../../src/components/ui/Tooltip'
import { ChatInput } from '../../src/components/chat/ChatInput'
import { ProjectCard } from '../../src/components/project/ProjectCard'
import { EmptyState } from '../../src/components/chat/EmptyState'
import { useProjectStore } from '../../src/stores/projectStore'
import { useUIStore } from '../../src/stores/uiStore'
import type { Project } from '../../src/types'

// ==========================================
// Button
// ==========================================
describe('Button', () => {
  it('renders with children text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('applies primary variant by default', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-[var(--accent-primary)]')
  })

  it('applies secondary variant', () => {
    render(<Button variant="secondary">Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-[var(--bg-secondary)]')
  })

  it('applies ghost variant', () => {
    render(<Button variant="ghost">Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-transparent')
  })

  it('applies danger variant', () => {
    render(<Button variant="danger">Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-[var(--danger-bg)]')
  })

  it('applies size classes', () => {
    render(<Button size="lg">Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('px-6')
  })

  it('disabled state adds disabled attribute', () => {
    render(<Button disabled>Test</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('fires click handler', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Test</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

// ==========================================
// Input
// ==========================================
describe('Input', () => {
  it('renders input element', () => {
    render(<Input />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('shows label when provided', () => {
    render(<Input label="Email" id="email" />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('shows error message', () => {
    render(<Input error="Required field" />)
    expect(screen.getByText('Required field')).toBeInTheDocument()
  })

  it('applies error styling', () => {
    render(<Input error="Error" />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('border-[var(--status-error-text)]')
  })

  it('passes through HTML attributes', () => {
    render(<Input placeholder="Enter email" type="email" />)
    const input = screen.getByPlaceholderText('Enter email')
    expect(input).toHaveAttribute('type', 'email')
  })

  it('typing updates value', async () => {
    render(<Input />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'hello')
    expect(input).toHaveValue('hello')
  })
})

// ==========================================
// Modal
// ==========================================
describe('Modal', () => {
  it('returns null when not open', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        Content
      </Modal>
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders content when open', () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    )
    expect(screen.getByText('Modal content')).toBeInTheDocument()
  })

  it('shows title when provided', () => {
    render(
      <Modal open={true} onClose={() => {}} title="My Modal">
        Content
      </Modal>
    )
    expect(screen.getByText('My Modal')).toBeInTheDocument()
  })

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose} title="Test">
        Content
      </Modal>
    )
    // The backdrop has the onClick handler — it's the element with bg-black/20
    const backdrop = document.querySelector('.bg-black\\/20')
    if (backdrop) fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose}>
        Content
      </Modal>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

// ==========================================
// Toggle
// ==========================================
describe('Toggle', () => {
  it('renders PM Mode and Engineer buttons', () => {
    render(<Toggle mode="engineering" onChange={() => {}} />)
    expect(screen.getByText('PM Mode')).toBeInTheDocument()
    expect(screen.getByText('Engineer')).toBeInTheDocument()
  })

  it('calls onChange when clicking PM mode', async () => {
    const onChange = vi.fn()
    render(<Toggle mode="engineering" onChange={onChange} />)
    await userEvent.click(screen.getByText('PM Mode'))
    expect(onChange).toHaveBeenCalledWith('pm')
  })

  it('calls onChange when clicking Engineer mode', async () => {
    const onChange = vi.fn()
    render(<Toggle mode="pm" onChange={onChange} />)
    await userEvent.click(screen.getByText('Engineer'))
    expect(onChange).toHaveBeenCalledWith('engineering')
  })

  it('collapsed mode shows abbreviated text', () => {
    render(<Toggle mode="pm" onChange={() => {}} collapsed />)
    expect(screen.getByText('PM')).toBeInTheDocument()
  })

  it('collapsed mode toggles on click', async () => {
    const onChange = vi.fn()
    render(<Toggle mode="pm" onChange={onChange} collapsed />)
    await userEvent.click(screen.getByText('PM'))
    expect(onChange).toHaveBeenCalledWith('engineering')
  })
})

// ==========================================
// Tooltip
// ==========================================
describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>
    )
    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })

  it('shows tooltip on mouseEnter', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Hover me').parentElement!)
    expect(screen.getByText('Help text')).toBeInTheDocument()
  })

  it('hides tooltip on mouseLeave', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>
    )
    const wrapper = screen.getByText('Hover me').parentElement!
    fireEvent.mouseEnter(wrapper)
    expect(screen.getByText('Help text')).toBeInTheDocument()
    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByText('Help text')).not.toBeInTheDocument()
  })
})

// ==========================================
// ChatInput
// ==========================================
describe('ChatInput', () => {
  it('renders textarea with default placeholder', () => {
    render(<ChatInput onSend={() => {}} />)
    expect(screen.getByPlaceholderText('Hỏi về dự án của bạn...')).toBeInTheDocument()
  })

  it('renders custom placeholder', () => {
    render(<ChatInput onSend={() => {}} placeholder="Ask anything" />)
    expect(screen.getByPlaceholderText('Ask anything')).toBeInTheDocument()
  })

  it('calls onSend when Enter pressed', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('Hỏi về dự án của bạn...')
    await userEvent.type(textarea, 'Hello{enter}')
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('does NOT call onSend on Shift+Enter', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('Hỏi về dự án của bạn...')
    await userEvent.type(textarea, 'Hello{shift>}{enter}{/shift}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('clears input after sending', async () => {
    render(<ChatInput onSend={() => {}} />)
    const textarea = screen.getByPlaceholderText('Hỏi về dự án của bạn...') as HTMLTextAreaElement
    await userEvent.type(textarea, 'Hello{enter}')
    expect(textarea.value).toBe('')
  })

  it('does not send empty message', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('Hỏi về dự án của bạn...')
    await userEvent.type(textarea, '{enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables textarea when disabled prop', () => {
    render(<ChatInput onSend={() => {}} disabled />)
    expect(screen.getByPlaceholderText('Hỏi về dự án của bạn...')).toBeDisabled()
  })

  it('shows disclaimer text', () => {
    render(<ChatInput onSend={() => {}} />)
    expect(screen.getByText(/Cortex có thể mắc lỗi/)).toBeInTheDocument()
  })
})

// ==========================================
// ProjectCard
// ==========================================
describe('ProjectCard', () => {
  const project: Project = {
    id: 'proj-1',
    name: 'Test Project',
    brainName: 'Atlas',
    sourceType: 'github',
    sourcePath: 'https://github.com/test/repo',
    brainStatus: 'ready',
    lastSyncAt: Date.now(),
    createdAt: Date.now()
  }

  it('shows project name', () => {
    render(<ProjectCard project={project} active={false} collapsed={false} onClick={() => {}} />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('shows brain name', () => {
    render(<ProjectCard project={project} active={false} collapsed={false} onClick={() => {}} />)
    expect(screen.getByText('Atlas')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<ProjectCard project={project} active={false} collapsed={false} onClick={onClick} />)
    await userEvent.click(screen.getByText('Test Project'))
    expect(onClick).toHaveBeenCalled()
  })

  it('collapsed mode shows first letter of brainName', () => {
    render(<ProjectCard project={project} active={false} collapsed={true} onClick={() => {}} />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('shows spinning icon when indexing', () => {
    const indexingProject = { ...project, brainStatus: 'indexing' as const }
    render(
      <ProjectCard project={indexingProject} active={false} collapsed={false} onClick={() => {}} />
    )
    // The RefreshCw icon gets animate-spin class
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })
})

// ==========================================
// EmptyState
// ==========================================
describe('EmptyState', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [],
      activeProjectId: null
    })
    useUIStore.setState({
      newProjectModalOpen: false
    })
  })

  it('shows welcome message when no project selected', () => {
    render(<EmptyState />)
    expect(screen.getByText('Chào mừng đến Cortex')).toBeInTheDocument()
  })

  it('shows "Tạo dự án đầu tiên" button when no project', () => {
    render(<EmptyState />)
    expect(screen.getByText('Tạo dự án đầu tiên')).toBeInTheDocument()
  })

  it('shows brain name when project selected', () => {
    const project: Project = {
      id: 'proj-1',
      name: 'My Project',
      brainName: 'Nova',
      sourceType: 'local',
      sourcePath: '/path',
      brainStatus: 'ready',
      lastSyncAt: null,
      createdAt: Date.now()
    }
    useProjectStore.setState({
      projects: [project],
      activeProjectId: 'proj-1'
    })

    render(<EmptyState />)
    expect(screen.getByText('Nova')).toBeInTheDocument()
    expect(screen.getByText('My Project')).toBeInTheDocument()
  })

  it('shows "ask anything" message when project selected', () => {
    const project: Project = {
      id: 'proj-1',
      name: 'Test',
      brainName: 'Atlas',
      sourceType: 'local',
      sourcePath: '/path',
      brainStatus: 'ready',
      lastSyncAt: null,
      createdAt: Date.now()
    }
    useProjectStore.setState({
      projects: [project],
      activeProjectId: 'proj-1'
    })

    render(<EmptyState />)
    expect(screen.getByText(/Hỏi bất kỳ điều gì/)).toBeInTheDocument()
  })
})
