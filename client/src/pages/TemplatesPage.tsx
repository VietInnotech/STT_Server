import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/auth'
import { templatesApi, settingsApi, type TemplateItem as ApiTemplateItem } from '../lib/api'

type TemplateItem = ApiTemplateItem

export default function TemplatesPage() {
  const user = useAuthStore((s) => s.user)
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [filter, setFilter] = useState<'all' | 'user' | 'system'>('all')
  const [viewMode, setViewMode] = useState<'list' | 'note'>('note')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TemplateItem | null>(null)
  const [openModal, setOpenModal] = useState(false)
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null)

  // Load templates from API
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await templatesApi.list()
        if (!mounted) return
        setTemplates(res.data.templates as TemplateItem[])
      } catch (err) {
        console.error('Failed to load templates', err)
        toast.error('Failed to load templates')
      }

      // load user preferences to find default template
      try {
        const res = await settingsApi.getPreferences()
        if (!mounted) return
        setDefaultTemplateId(res.data.defaultTemplateId ?? null)
      } catch (err) {
        // ignore
      }
    })()

    return () => { mounted = false }
  }, [])

  const openCreate = (t?: TemplateItem) => {
    setEditing(t ?? null)
    setOpenModal(true)
  }

  const saveTemplate = (data: { name: string; content: string; ownerType: 'system' | 'user' }) => {
    if (editing) {
      templatesApi.update(editing.id, { name: data.name, content: data.content })
        .then((res) => {
          setTemplates((prev) => prev.map((p) => p.id === editing.id ? res.data.template as TemplateItem : p))
          toast.success('Template updated')
        })
        .catch((err) => {
          console.error('Failed to update template', err)
          toast.error('Failed to update template')
        })
        .finally(() => {
          setOpenModal(false)
          setEditing(null)
        })
  } else {
      templatesApi.create({ name: data.name, content: data.content, ownerType: data.ownerType })
        .then((res) => {
          setTemplates((p) => [res.data.template as TemplateItem, ...p])
          toast.success('Template created')
        })
        .catch((err) => {
          console.error('Failed to create template', err)
          toast.error('Failed to create template')
        })
        .finally(() => {
          setOpenModal(false)
          setEditing(null)
        })
    }
  }

  // setDefault handled inline via templatesApi.setDefault in UI; this helper removed.

  const removeTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    if (t.ownerType === 'system' && user?.role !== 'admin') {
      toast.error('Only admins can delete system templates')
      return
    }
    if (!confirm(`Delete template ${t.name}?`)) return
    templatesApi.delete(id)
      .then(() => {
        setTemplates((p) => p.filter((x) => x.id !== id))
        toast.success('Template deleted')
      })
      .catch((err) => {
        console.error('Failed to delete template', err)
        toast.error('Failed to delete template')
      })
  }

  const visible = templates.filter((t) => {
    if (filter === 'all') return true
    if (filter === 'user') return t.ownerType === 'user'
    return t.ownerType === 'system'
  })
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Templates</h2>
          <p className="text-sm text-gray-500 mt-1">Manage personal and system templates</p>
        </div>
        <div className="flex items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates..." className="px-3 py-2 border border-gray-300 rounded-lg" />
          <div className="flex items-center gap-2 bg-gray-100 rounded-md p-1">
            <button onClick={() => setViewMode('note')} className={viewMode === 'note' ? 'px-3 py-1 bg-white rounded' : 'px-3 py-1 text-gray-600'}>Notes</button>
            <button onClick={() => setViewMode('list')} className={viewMode === 'list' ? 'px-3 py-1 bg-white rounded' : 'px-3 py-1 text-gray-600'}>List</button>
          </div>
          <button onClick={() => openCreate()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">New Template</button>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setFilter('all')} className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-blue-50 text-blue-600' : 'bg-white'}`}>All</button>
        <button onClick={() => setFilter('user')} className={`px-3 py-1 rounded ${filter === 'user' ? 'bg-blue-50 text-blue-600' : 'bg-white'}`}>My Templates</button>
        <button onClick={() => setFilter('system')} className={`px-3 py-1 rounded ${filter === 'system' ? 'bg-blue-50 text-blue-600' : 'bg-white'}`}>System</button>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {visible.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{t.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{t.ownerType === 'system' ? 'System' : (t.ownerId === user?.id ? 'You' : 'User')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      {t.ownerType === 'system' && user?.role !== 'admin' ? (
                        <div className="text-xs text-gray-500 px-3 py-2">Read-only</div>
                      ) : (
                        <>
                          <button onClick={() => openCreate(t)} className="px-3 py-2 text-sm bg-gray-100 rounded">Edit</button>
                          <button onClick={() => removeTemplate(t.id)} className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded">Delete</button>
                          {defaultTemplateId === t.id ? (
                            <div className="px-3 py-2 text-sm bg-green-50 text-green-700 rounded">Default</div>
                          ) : (
                            <button onClick={async () => {
                              try {
                                await templatesApi.setDefault(t.id)
                                toast.success('Default template set')
                                const res = await settingsApi.getPreferences()
                                setDefaultTemplateId(res.data.defaultTemplateId ?? null)
                              } catch (err) {
                                console.error('Failed to set default', err)
                                toast.error('Failed to set default')
                              }
                            }} className="px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded">Set as default</button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-500">No templates</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((t) => (
            <div key={t.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  <div className="text-xs text-gray-500">{t.ownerType === 'system' ? 'System' : (t.ownerId === user?.id ? 'You' : 'User')}</div>
                </div>
                <div className="flex items-center gap-2">
                  {t.ownerType === 'system' && user?.role !== 'admin' ? (
                    <div className="text-xs text-gray-500 px-2 py-1">Read-only</div>
                  ) : (
                    <>
                      <button onClick={() => openCreate(t)} className="px-2 py-1 text-sm bg-gray-100 rounded">Edit</button>
                      <button onClick={() => removeTemplate(t.id)} className="px-2 py-1 text-sm bg-red-50 text-red-600 rounded">Delete</button>
                      {defaultTemplateId === t.id ? (
                        <div className="px-2 py-1 text-sm bg-green-50 text-green-700 rounded">Default</div>
                      ) : (
                        <button onClick={async () => {
                          try {
                            await templatesApi.setDefault(t.id)
                            toast.success('Default template set')
                            const res = await settingsApi.getPreferences()
                            setDefaultTemplateId(res.data.defaultTemplateId ?? null)
                          } catch (err) {
                            console.error('Failed to set default', err)
                            toast.error('Failed to set default')
                          }
                        }} className="px-2 py-1 text-sm bg-blue-50 text-blue-600 rounded">Set as default</button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-auto">{t.content}</div>
            </div>
          ))}
        </div>
      )}

      {openModal && (
        <Modal
          open={openModal}
          onClose={() => { setOpenModal(false); setEditing(null) }}
          title={editing ? `Edit: ${editing.name}` : 'New Template'}
          maxWidth="lg"
        >
          <TemplateForm initial={editing} onSave={saveTemplate} onCancel={() => { setOpenModal(false); setEditing(null) }} />
        </Modal>
      )}
    </div>
  )
}

function TemplateForm({ initial, onSave, onCancel }: { initial?: TemplateItem | null; onSave: (data: { name: string; content: string; ownerType: 'system' | 'user' }) => void; onCancel: () => void }) {
  const user = useAuthStore((s) => s.user)
  const [name, setName] = useState(initial?.name ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [ownerType, setOwnerType] = useState<'system' | 'user'>(initial?.ownerType ?? 'user')

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      if (!name.trim()) return toast.error('Name required')
      if (ownerType === 'system' && user?.role !== 'admin') { toast.error('Only admins can create system templates'); return }
      // Validate JSON content
      try {
        JSON.parse(content)
      } catch (err) {
        toast.error('Content must be valid JSON')
        return
      }
      onSave({ name: name.trim(), content, ownerType })
    }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
        <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
        <select value={ownerType} onChange={(e) => setOwnerType(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="user">User</option>
          <option value="system">System</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded bg-gray-100">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white">Save</button>
      </div>
    </form>
  )
}
