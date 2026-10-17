'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { api, getName, getToken, getWorkspaceId } from '@/lib/api'

type Project = { id: string; name: string; task_count: number }

export default function Projects() {
  const router = useRouter()
  const [list, setList] = useState<Project[]>([])
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    setUserName(getName() ?? '')
    if (!getToken()) { router.replace('/login'); return }
    api<Project[]>('/api/projects').then(setList).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [router])

  async function create() {
    if (!projectName.trim()) return
    setError('')
    try {
      const project = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name: projectName.trim(), workspace_id: getWorkspaceId() }) })
      router.push('/projects/' + project.id)
    } catch (e) { setError((e as Error).message) }
  }

  const totalTasks = list.reduce((total, project) => total + Number(project.task_count || 0), 0)

  return <><Header/><main className="wrap" id="main">
    <section className="workspace-intro"><div><span className="workspace-overline">YOUR WORKSPACE</span><h1>{userName ? `Good to see you, ${userName.split(' ')[0]}.` : 'Welcome to your workspace.'}</h1><p>A little progress, every day. What are we working on?</p></div><div className="workspace-create"><input aria-label="Project name" placeholder="Name your next project" value={projectName} onChange={e=>setProjectName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&create()}/><button onClick={create}>＋ New project</button></div></section>
    <div className="err" role="alert">{error}</div>
    <section className="workspace-stats"><div className="stat-card"><span className="stat-icon">▦</span><div><strong>{list.length}</strong><small>Active projects</small></div></div><div className="stat-card"><span className="stat-icon">✓</span><div><strong>{totalTasks}</strong><small>Tasks in motion</small></div></div><div className="stat-card"><span className="stat-icon">✳</span><div><strong>Good</strong><small>Time to make progress</small></div></div></section>
    <div className="section-heading"><h2>Your projects</h2><span>{list.length} {list.length===1?'project':'projects'}</span></div>
    {loading&&<p className="mut">Loading your projects…</p>}
    {!loading&&list.length===0&&<section className="empty-state"><div className="empty-illustration">✳</div><h3>A good idea starts somewhere.</h3><p>Create your first project and give your team a place to get things moving.</p><button className="p" style={{padding:'10px 14px'}} onClick={()=>document.querySelector<HTMLInputElement>('.workspace-create input')?.focus()}>＋ Create a project</button></section>}
    <div className="grid">{list.map((project,i)=><article key={project.id} className="pc" onClick={()=>router.push('/projects/'+project.id)}><div className="project-card-top"><span className="project-card-icon">{['▦','✳','◈'][i%3]}</span><span className="project-more">•••</span></div><b>{project.name}</b><p className="mut">A shared space for your team’s next steps.</p><div className="project-card-footer"><span>{project.task_count} {project.task_count===1?'task':'tasks'}</span><span className="avatar-stack"><i>Y</i><i>T</i></span></div></article>)}</div>
  </main></>
}
