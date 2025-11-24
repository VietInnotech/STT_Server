import { useState, useEffect } from 'react'
import { UserPlus, Shield, Mail, Calendar, Edit2, Trash2, X } from 'lucide-react'
import { usersApi } from '../lib/api'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'

interface User {
  id: string
  username: string
  email: string
  fullName?: string | null
  role: string
  roleId?: string
  isActive: boolean
  lastLogin?: string | null
  createdAt: string
  updatedAt?: string
}

interface Role {
  id: string
  name: string
  description: string | null
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateFile, setTemplateFile] = useState<File | null>(null)
  const [templateText, setTemplateText] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    roleId: '',
  })
  const [confirmModal, setConfirmModal] = useState<{ action: 'delete' | 'toggle' | null; user: User | null }>({ action: null, user: null })

  // Fetch users and roles
  const fetchData = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        usersApi.list(),
        usersApi.getRoles(),
      ])
      setUsers(usersRes.data.users)
      setRoles(rolesRes.data.roles)
    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // format a time portion as HH:mm:ss (24-hour) from an ISO string
  const formatTimeHHMMSS = (iso?: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user)
      setFormData({
        username: user.username,
        email: user.email,
        password: '',
        fullName: user.fullName || '',
        roleId: user.roleId || '',
      })
    } else {
      setEditingUser(null)
      setFormData({
        username: '',
        email: '',
        password: '',
        fullName: '',
        roleId: roles.length > 0 ? roles[0].id : '',
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingUser(null)
    setFormData({
      username: '',
      email: '',
      password: '',
      fullName: '',
      roleId: '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingUser) {
        // Update existing user
        await usersApi.update(editingUser.id, {
          email: formData.email,
          fullName: formData.fullName || undefined,
          roleId: formData.roleId,
          ...(formData.password && { password: formData.password }),
        })
        toast.success('User updated successfully')
      } else {
        // Create new user
        await usersApi.create({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName || undefined,
          roleId: formData.roleId,
        })
        toast.success('User created successfully')
      }
      handleCloseModal()
      fetchData()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save user')
    }
  }

  const handleDelete = async (userId: string) => {
    try {
      await usersApi.delete(userId)
      toast.success('User deleted successfully')
      fetchData()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete user')
    }
  }

  const handleToggleActive = async (user: User) => {
    try {
      // Prevent toggling admin accounts from UI
      if (user.role === 'admin') {
        toast.error('Admin accounts cannot be disabled from the UI')
        return
      }
      await usersApi.update(user.id, { isActive: !user.isActive })
      toast.success(`User ${user.isActive ? 'disabled' : 'enabled'} successfully`)
      fetchData()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update user status')
    }
  }

  const openDeleteConfirm = (user: User) => setConfirmModal({ action: 'delete', user })
  const openToggleConfirm = (user: User) => {
    if (user.role === 'admin') {
      toast.error('Admin accounts cannot be disabled from the UI')
      return
    }
    setConfirmModal({ action: 'toggle', user })
  }

  const openTemplateModal = (user: User) => {
    setEditingUser(user)
    setTemplateFile(null)
    setTemplateText('')
    setShowTemplateModal(true)
  }

  const closeTemplateModal = () => {
    setShowTemplateModal(false)
    setEditingUser(null)
    setTemplateFile(null)
    setTemplateText('')
  }

  const handleTemplateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0]
    if (f) {
      setTemplateFile(f)
      // Try to read file into text preview
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setTemplateText(reader.result)
      }
      reader.readAsText(f)
    } else {
      setTemplateFile(null)
      setTemplateText('')
    }
  }

  const handleUploadTemplate = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!editingUser) return
    // Validate JSON either from file content (templateText) or textarea
    try {
      if (!templateText) {
        toast.error('Please provide a JSON template as a file or paste the JSON text')
        return
      }
      JSON.parse(templateText)
    } catch (err: any) {
      toast.error('Invalid JSON: ' + (err?.message || 'Parse error'))
      return
    }

    try {
      // Call API; prefer sending file if available for original filename
      if (templateFile) {
        await usersApi.uploadTemplate(editingUser.id, templateFile, undefined as any)
      } else {
        await usersApi.uploadTemplate(editingUser.id, undefined as any, templateText)
      }
      toast.success('Template uploaded successfully')
      closeTemplateModal()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to upload template')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Users</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage user accounts and permissions
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {users.map((user) => (
          <div
            key={user.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{user.username}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Shield className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-500">{user.role}</span>
                  </div>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded ${user.isActive
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
                }`}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="space-y-2 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">{user.email}</span>
              </div>
              {user.fullName && (
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{user.fullName}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">
                  Joined {new Date(user.createdAt).toLocaleDateString()}{' '}
                  <span className="text-xs text-gray-500">{formatTimeHHMMSS(user.createdAt)}</span>
                </span>
              </div>
              {user.lastLogin && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">
                    Last login: {new Date(user.lastLogin).toLocaleDateString()} {' '}
                    <span className="text-xs text-gray-500">{formatTimeHHMMSS(user.lastLogin)}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => handleOpenModal(user)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={() => openTemplateModal(user)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                Template
              </button>
              <button
                onClick={() => openDeleteConfirm(user)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              {/* Disable / Enable button for non-admin users */}
              {user.role !== 'admin' && (
                <button
                  onClick={() => openToggleConfirm(user)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${user.isActive ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100' : 'text-green-600 bg-green-50 hover:bg-green-100'
                    }`}
                >
                  {user.isActive ? (
                    <span className="flex items-center gap-2"><X className="h-4 w-4" /> Disable</span>
                  ) : (
                    <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Enable</span>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading users...</div>
        </div>
      )}

      {/* Template Upload Modal (use shared Modal component for consistent backdrop/styling) */}
      {showTemplateModal && editingUser && (
        <Modal
          title={`Upload Template for ${editingUser.username}`}
          open={showTemplateModal}
          onClose={closeTemplateModal}
          maxWidth="lg"
        >
          <form onSubmit={handleUploadTemplate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">JSON File (.json)</label>
              <input type="file" accept="application/json,.json" onChange={handleTemplateFileChange} className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Or paste JSON text</label>
              <textarea value={templateText} onChange={(e) => setTemplateText(e.target.value)} rows={8} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            </div>

            <div className="flex gap-3 mt-4">
              <button type="button" onClick={closeTemplateModal} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Upload</button>
            </div>
          </form>
        </Modal>
      )}

      {!loading && users.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
          <p className="text-gray-500">Create your first user to get started</p>
        </div>
      )}

      {/* Add/Edit User Modal (use shared Modal component for consistent backdrop/styling) */}
      {showModal && (
        <Modal
          title={editingUser ? 'Edit User' : 'Add New User'}
          open={showModal}
          onClose={handleCloseModal}
          maxWidth="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                disabled={!!editingUser}
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="johndoe"
              />
              {editingUser && (
                <p className="mt-1 text-xs text-gray-500">Username cannot be changed</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                required
                value={formData.roleId}
                onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password {editingUser && '(leave blank to keep current)'}
              </label>
              <input
                type="password"
                required={!editingUser}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={editingUser ? '••••••••' : 'Enter password'}
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingUser ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm action modal for Delete / Enable/Disable */}
      {confirmModal.action && confirmModal.user && (
        <Modal
          title={confirmModal.action === 'delete' ? `Delete ${confirmModal.user.username}?` : `${confirmModal.user.isActive ? 'Disable' : 'Enable'} ${confirmModal.user.username}?`}
          open={true}
          onClose={() => setConfirmModal({ action: null, user: null })}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">Are you sure you want to {confirmModal.action === 'delete' ? 'permanently delete' : (confirmModal.user.isActive ? 'disable' : 'enable')} this user?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmModal({ action: null, user: null })} className="px-3 py-2 rounded bg-gray-100">Cancel</button>
              <button
                onClick={async () => {
                  const u = confirmModal.user
                  const act = confirmModal.action
                  setConfirmModal({ action: null, user: null })
                  if (!u || !act) return
                  if (act === 'delete') {
                    await handleDelete(u.id)
                  } else if (act === 'toggle') {
                    await handleToggleActive(u)
                  }
                }}
                className={`px-3 py-2 rounded ${confirmModal.action === 'delete' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                {confirmModal.action === 'delete' ? 'Delete' : (confirmModal.user.isActive ? 'Disable' : 'Enable')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
