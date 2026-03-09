/**
 * Git Actions — Git operations as agent actions
 */
import { execFile } from 'child_process'

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || String(err)))
      else resolve(stdout.trim())
    })
  })
}

export async function createBranch(repoPath: string, branchName: string): Promise<string> {
  await git(['checkout', '-b', branchName], repoPath)
  return `Created and switched to branch: ${branchName}`
}

export async function switchBranch(repoPath: string, branchName: string): Promise<string> {
  await git(['checkout', branchName], repoPath)
  return `Switched to branch: ${branchName}`
}

export async function commitChanges(repoPath: string, message: string, files?: string[]): Promise<string> {
  if (files && files.length > 0) {
    await git(['add', ...files], repoPath)
  } else {
    await git(['add', '-A'], repoPath)
  }
  await git(['commit', '-m', message], repoPath)
  return `Committed: ${message}`
}

export async function getDiff(repoPath: string, staged: boolean = false): Promise<string> {
  const args = staged ? ['diff', '--staged'] : ['diff']
  return git(args, repoPath)
}

export async function getStatus(repoPath: string): Promise<string> {
  return git(['status', '--short'], repoPath)
}

export async function gitListBranches(repoPath: string): Promise<string[]> {
  const output = await git(['branch', '--list'], repoPath)
  return output.split('\n').map(b => b.replace(/^\*?\s+/, '')).filter(Boolean)
}

export async function getLog(repoPath: string, limit: number = 10): Promise<string> {
  return git(['log', `--oneline`, `-${limit}`], repoPath)
}