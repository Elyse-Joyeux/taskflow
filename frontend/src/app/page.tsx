'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/api'
import { CircleCheck, ListChecks, Target, UsersRound } from 'lucide-react'
import AeroShards from '@/components/AeroShards'
import { useTheme } from '@/components/ThemeProvider'

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="brand-mark" aria-hidden="true" style={{ width: size, height: size }}>
      <span /><span /><span /><span />
    </span>
  )
}

export default function Home() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'board' | 'list' | 'milestones'>('board')
  const [taskDone, setTaskDone] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (getToken()) router.replace('/projects')
  }, [router])

  return (
    <main className="landing" id="content">

      {/* Nav */}
      <nav className="landing-nav">
        <Link className="brand" href="/"><BrandMark /> <span>taskflow</span></Link>
        <div className="landing-links">
          <a href="#features">Features</a>
          <a href="#preview">Product tour</a>
          <a href="#how-it-works">Why Taskflow</a>
        </div>
        <div className="nav-actions">
          {mounted && (
            <button type="button" className="landing-theme-toggle"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme">
              {resolvedTheme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          )}
                   <Link className="nav-login" href="/login">Log in</Link>
          <Link className="button button-primary button-sm" href="/signup">Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero" id="preview">
        <div className="hero-copy">
          <span className="hero-kicker">PROJECT MANAGEMENT, BUILT FOR FOCUS</span>
          <h1>
            Make room for
            <br />
            <span>great work.</span>
          </h1>
          <p className="hero-description">
            Taskflow brings projects, tasks, and team updates into one calm workspace—so everyone knows what matters now, who owns it, and what comes next.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/signup">Start for free</Link>
            <Link className="button button-secondary" href="/login">Sign in</Link>
          </div>
          <ul className="hero-proof" aria-label="What Taskflow helps your team do">
            <li><CircleCheck aria-hidden="true" size={15} /> Keep priorities clear</li>
            <li><ListChecks aria-hidden="true" size={15} /> See the next step</li>
            <li><UsersRound aria-hidden="true" size={15} /> Stay in sync</li>
          </ul>
        </div>

        {/* Hero visual */}
        <div className="hero-visual" role="group" aria-label="Interactive Taskflow product preview">
          <div className="hero-shard-layer" aria-hidden="true">
            <AeroShards enabled={false} style={{ width: '100%', height: '100%' }} />
          </div>
          <div className="board-window">
              <div className="window-top">
                <div className="window-dots" aria-hidden="true"><i/><i/><i/></div>
                <span>Website refresh</span>
                <span className="window-menu" aria-hidden="true">•••</span>
              </div>
              <div className="preview-layout">
                <aside className="preview-side">
                  <div className="preview-brand"><BrandMark size={18}/> taskflow</div>
                  <div className="side-label">Workspace</div>
                  <div className="side-item active">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="6" height="18" rx="1"/><rect x="10" y="3" width="12" height="10" rx="1"/><rect x="10" y="15" width="12" height="6" rx="1"/></svg>
                    Projects
                  </div>
                  <div className="side-item">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    My tasks
                  </div>
                  <div className="side-label side-label-lower">Projects</div>
                  <div className="side-project"><i className="project-dot purple"/>Website refresh</div>
                  <div className="side-project"><i className="project-dot green"/>Product launch</div>
                  <div className="side-project"><i className="project-dot amber"/>Q4 planning</div>
                </aside>

                <div className="preview-main">
                  <div className="preview-topline">
                    <span>Projects / Website refresh</span>
                    <span className="preview-members" aria-hidden="true"><i>J</i><i>M</i><i>A</i><b>+</b></span>
                  </div>
                  <div className="preview-heading">
                    <div>
                      <span className="preview-kicker">Active Sprint</span>
                      <h3>Website refresh</h3>
                    </div>
                    <span className="preview-share">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: 4 }} aria-hidden="true">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                        <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                      </svg>
                      Share
                    </span>
                  </div>

                  <div className="preview-interactive-tabs" role="group" aria-label="Preview layout">
                    {(['board', 'list', 'milestones'] as const).map((tab) => (
                      <button key={tab} type="button" aria-pressed={activeTab === tab}
                        className={`preview-tab-btn${activeTab === tab ? ' active' : ''}`}
                        onClick={() => setActiveTab(tab)}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  {activeTab === 'board' && (
                    <div className="preview-columns" role="tabpanel">
                      <div className="preview-column">
                        <div className="preview-col-heading"><i className="project-dot purple" aria-hidden="true"/>To Do <span>{taskDone ? 2 : 3}</span></div>
                        {!taskDone && (
                          <button type="button" className="preview-task" aria-pressed={false}
                            aria-label="Mark Research competitor flows complete"
                            onClick={() => setTaskDone(true)}>
                            <p>Research competitor flows</p>
                            <div><span className="task-chip chip-purple">Research</span><i className="mini-avatar" aria-hidden="true"/></div>
                          </button>
                        )}
                        <div className="preview-task">
                          <p>Gather visual references</p>
                          <div><span className="task-chip chip-blue">Design</span><i className="mini-avatar mini-1" aria-hidden="true"/></div>
                        </div>
                        <div className="preview-add">＋ Add task</div>
                      </div>
                      <div className="preview-column">
                        <div className="preview-col-heading"><i className="project-dot blue" aria-hidden="true"/>In Progress <span>2</span></div>
                        <div className="preview-task">
                          <p>Homepage concepts</p>
                          <div><span className="task-chip chip-blue">Design</span><i className="mini-avatar mini-2" aria-hidden="true"/></div>
                        </div>
                        <div className="preview-task">
                          <p>Write product copy</p>
                          <div><span className="task-chip chip-purple">Content</span><i className="mini-avatar" aria-hidden="true"/></div>
                        </div>
                      </div>
                      <div className="preview-column">
                        <div className="preview-col-heading"><i className="project-dot green" aria-hidden="true"/>Done <span>{taskDone ? 3 : 2}</span></div>
                        {taskDone && (
                          <button type="button" className="preview-task" aria-pressed={true}
                            aria-label="Move Research competitor flows back to To Do"
                            onClick={() => setTaskDone(false)}>
                            <p>Research competitor flows</p>
                            <div><span className="task-chip chip-green">Done</span><i className="mini-avatar" aria-hidden="true"/></div>
                          </button>
                        )}
                        <div className="preview-task">
                          <p>Project brief</p>
                          <div><span className="task-chip chip-green">Strategy</span><i className="mini-avatar mini-1" aria-hidden="true"/></div>
                        </div>
                        <div className="preview-task">
                          <p>Team kickoff sync</p>
                          <div><span className="task-chip chip-green">Planning</span><i className="mini-avatar mini-2" aria-hidden="true"/></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'list' && (
                    <div className="preview-interactive-list" role="tabpanel">
                      {[
                        { label: 'Homepage concepts & wireframes', chip: 'chip-blue', status: 'In Progress', done: false },
                        { label: 'Write new product copy', chip: 'chip-purple', status: 'In Progress', done: false },
                        { label: 'Project brief & scope', chip: 'chip-green', status: 'Done', done: true },
                        { label: 'Team kickoff sync', chip: 'chip-green', status: 'Done', done: true },
                      ].map((item, i) => (
                        <div className="preview-list-row" key={i}>
                          <div className="preview-list-title">
                            <input type="checkbox" defaultChecked={item.done} readOnly style={{ accentColor: 'var(--violet)' }} aria-label={item.label}/>
                            <span style={item.done ? { textDecoration: 'line-through', opacity: .6 } : {}}>{item.label}</span>
                          </div>
                          <span className={`task-chip ${item.chip}`}>{item.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'milestones' && (
                    <div className="preview-interactive-milestones" role="tabpanel">
                      <div className="preview-milestone-item">
                        <div className="preview-milestone-head">
                          <span>Design System & Wireframes</span>
                          <span style={{ color: 'var(--violet)', fontWeight: 700 }}>85%</span>
                        </div>
                        <div className="preview-milestone-bar"><div className="preview-milestone-fill" style={{ width: '85%' }}/></div>
                        <small style={{ color: 'var(--muted)', fontSize: 10 }}>Due next Friday · 11 of 13 done</small>
                      </div>
                      <div className="preview-milestone-item">
                        <div className="preview-milestone-head">
                          <span>Responsive Frontend Implementation</span>
                          <span style={{ color: 'var(--teal)', fontWeight: 700 }}>50%</span>
                        </div>
                        <div className="preview-milestone-bar"><div className="preview-milestone-fill" style={{ width: '50%', background: 'var(--teal)' }}/></div>
                        <small style={{ color: 'var(--muted)', fontSize: 10 }}>Due in 2 weeks · 6 of 12 done</small>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
      </section>

      {/* Product introduction */}
      <section className="landing-intro" id="how-it-works" aria-labelledby="landing-intro-title">
        <div className="landing-intro-copy">
          <span className="section-kicker">A better rhythm for project work</span>
          <h2 id="landing-intro-title">From moving pieces to <span>shared momentum.</span></h2>
          <p>
            When plans, ownership, and conversations live in different places, it&apos;s hard to see progress. Taskflow brings the whole project together, giving your team a steady place to make decisions and keep good work moving.
          </p>
        </div>
        <div className="landing-intro-steps">
          <article className="landing-intro-step">
            <span className="intro-step-icon"><Target aria-hidden="true" size={18} /></span>
            <div>
              <span className="intro-step-number">01</span>
              <h3>Start with a clear plan</h3>
              <p>Turn big goals into visible tasks, milestones, and ownership.</p>
            </div>
          </article>
          <article className="landing-intro-step">
            <span className="intro-step-icon"><ListChecks aria-hidden="true" size={18} /></span>
            <div>
              <span className="intro-step-number">02</span>
              <h3>Keep the next move obvious</h3>
              <p>Give everyone a quick view of what&apos;s moving and what needs attention.</p>
            </div>
          </article>
          <article className="landing-intro-step">
            <span className="intro-step-icon"><UsersRound aria-hidden="true" size={18} /></span>
            <div>
              <span className="intro-step-number">03</span>
              <h3>Make progress together</h3>
              <p>Keep project updates close to the work, so your team stays in sync.</p>
            </div>
          </article>
        </div>
      </section>

      {/* Features */}
      <section className="feature-section" id="features">
        <div className="section-intro">
            <span className="section-kicker">Work in a better flow</span>
            <h2>All the moving parts.<br/><span>One peaceful place.</span></h2>
            <p>Everything your team needs to focus, organize projects, and celebrate what gets done.</p>
        </div>

        <div className="feature-grid-v2">
          <article className="landing-spotlight">
            <div className="landing-spotlight-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 3v18M15 3v18"/>
              </svg>
            </div>
            <h3>Board & List views with Instant Undo</h3>
            <p>Reorder tasks effortlessly with fluid drag-and-drop or switch to a high-density table. Restore anything immediately with one-click Toast Undo.</p>
          </article>

          <article className="landing-spotlight">
            <div className="landing-spotlight-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <h3>Command Palette at your fingertips</h3>
            <p>Press <kbd className="palette-kbd">Ctrl+K</kbd> or <kbd className="palette-kbd">/</kbd> anywhere to jump to projects, search tasks instantly, or switch workspaces without lifting your hands.</p>
          </article>

          <article className="landing-spotlight">
            <div className="landing-spotlight-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <h3>Real-time presence & Live sync</h3>
            <p>Task changes, comments, and milestones stream across your team over WebSockets with optimistic updates — zero page reloads, always in sync.</p>
          </article>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="closing-cta" id="get-started">
        <span className="section-kicker">A fresh start for your team</span>
        <h2>Ready when<br/>you are.</h2>
        <p>Bring your next big idea. We&apos;ll help with the flow.</p>
        <Link className="button button-primary" href="/signup">Create your workspace</Link>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <Link className="brand" href="/"><BrandMark size={22}/> <span>taskflow</span></Link>
          <span>Crafted for focus, clarity, and team momentum.</span>
        </div>
        <div className="landing-footer-meta">
          <span className="site-copyright">© 2026 Taskflow Inc. All rights reserved.</span>
          <Link href="/login">Already have an account? <b>Sign in</b></Link>
        </div>
      </footer>
    </main>
  )
}
