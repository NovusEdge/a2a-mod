import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { Link } from 'react-router'
import { REPO } from './source'

export function baseOptions(): BaseLayoutProps {
  return {
    githubUrl: REPO,
    nav: { title: <span className="a2a-wordmark">a2a-mod</span> },
  }
}

export function Footer() {
  return (
    <footer className="a2a-foot">
      <span>
        MIT licence <code>A2A 1.0 | 0.3</code>
      </span>
      <nav aria-label="Project">
        <a href={`${REPO}/blob/main/CHANGELOG.md`}>Changelog</a>
        <Link to="/security">Security</Link>
        <a href={REPO}>GitHub</a>
      </nav>
    </footer>
  )
}
