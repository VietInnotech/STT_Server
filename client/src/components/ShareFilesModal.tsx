import { useEffect, useState } from 'react'
import Modal from './Modal'
import { usersApi, filesApi, type UserListItem, type FileItem } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import toast from 'react-hot-toast'

interface ShareFilesModalProps {
  open: boolean
  onClose: () => void
  files: FileItem[]
  onShared?: () => void
}

export default function ShareFilesModal({ open, onClose, files, onShared }: ShareFilesModalProps) {
  const [users, setUsers] = useState<UserListItem[]>([])
  const currentUser = useAuthStore((s) => s.user)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    // Fetch users when modal opens
    usersApi.list()
      .then((res) => {
        // filter out current user if available
        const list = currentUser ? res.data.users.filter((u: UserListItem) => u.id !== currentUser.id) : res.data.users
        setUsers(list)
      })
      .catch((err) => {
        console.error('Failed to fetch users', err)
        toast.error('Failed to load users')
      })
  }, [open, currentUser])

  useEffect(() => {
    // Reset selections when files list changes or modal closes
    if (!open) {
      setSelectedFileIds({})
      setSelectedUserIds([])
    }
  }, [open, files])

  const toggleFile = (id: string) => {
    setSelectedFileIds((s) => ({ ...s, [id]: !s[id] }))
  }

  const toggleUser = (id: string) => {
    setSelectedUserIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const handleShare = async () => {
    if (!selectedUserIds || selectedUserIds.length === 0) {
      toast.error('Please select at least one user to share with')
      return
    }
    const fileIds = Object.keys(selectedFileIds).filter((id) => selectedFileIds[id])
    if (fileIds.length === 0) {
      toast.error('Please select at least one file to share')
      return
    }

    setLoading(true)
    try {
      // Create shares for each selected user and selected file
      const shares: Array<{ fileId: string; fileType: 'audio' | 'text'; userId: string; expiresInDays: number | null }> = []
      for (const uid of selectedUserIds) {
        for (const id of fileIds) {
          const f = files.find((x) => x.id === id)
          const fileType = f && f.mimeType?.startsWith('audio') ? 'audio' : 'text'
          shares.push({ fileId: id, fileType: fileType as 'audio' | 'text', userId: uid, expiresInDays })
        }
      }
      await filesApi.share(shares)
      toast.success('Files shared')
      onShared?.()
      onClose()
    } catch (err) {
      console.error('Share failed', err)
      toast.error('Failed to share files')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Share Files" open={open} onClose={onClose} maxWidth="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select users</label>
          <div className="max-h-48 overflow-auto border rounded p-2">
            {users.length === 0 ? (
              <div className="text-sm text-gray-500">No other users available</div>
            ) : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center">
                    <label className="flex items-center gap-2 w-full">
                      <input type="checkbox" checked={selectedUserIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                      <span className="ml-2">{u.fullName || u.username} ({u.username})</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select files to share</label>
          <div className="max-h-64 overflow-auto border rounded p-2">
            {files.length === 0 ? (
              <div className="text-sm text-gray-500">No files available</div>
            ) : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!selectedFileIds[f.id]} onChange={() => toggleFile(f.id)} />
                      <span className="ml-2">{f.filename}</span>
                    </label>
                    <span className="text-sm text-gray-400">{Math.round(f.fileSize / 1024)} KB</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Share duration (days, optional)</label>
          <input
            type="number"
            min={1}
            value={expiresInDays ?? ''}
            onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : null)}
            placeholder="e.g. 7"
            className="w-48 border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-400 mt-1">Leave empty for no expiry</p>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-gray-100">Cancel</button>
          <button onClick={handleShare} disabled={loading} className="px-3 py-2 rounded bg-blue-600 text-white">
            {loading ? 'Sharing...' : 'Share'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
