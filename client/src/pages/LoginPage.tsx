import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { authApi } from '../lib/api'
import { getDeviceFingerprint } from '../lib/utils'
import toast from 'react-hot-toast'
import { LogIn } from 'lucide-react'
import TwoFactorVerifyModal from '../components/TwoFactorVerifyModal'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()

  // 2FA state
  const [show2FAModal, setShow2FAModal] = useState(false)
  const [userId2FA, setUserId2FA] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Call real API
      const response = await authApi.login({ username, password, deviceFingerprint: getDeviceFingerprint() })

      // Check if 2FA is required
      if (response.data.requires2FA && response.data.userId) {
        setUserId2FA(response.data.userId)
        setShow2FAModal(true)
        setLoading(false)
        return
      }

      const { user, token } = response.data

      // Validate required fields
      if (!user || !token) {
        toast.error('Invalid login response')
        return
      }

      // Store user and token
      login(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          fullName: user.fullName || undefined,
        },
        token
      )

      toast.success('Login successful!')
      navigate('/')
    } catch (error: any) {
      const message = error.response?.data?.error || 'Login failed'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handle2FASuccess = (data: { user: any; token: string }) => {
    const { user, token } = data

    // Store user and token
    login(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        fullName: user.fullName || undefined,
      },
      token
    )

    toast.success('Login successful!')
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <LogIn className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              UNV AI Report
            </h1>
            <p className="text-gray-500">Local Administration Panel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      {/* 2FA Verification Modal */}
      <TwoFactorVerifyModal
        isOpen={show2FAModal}
        userId={userId2FA}
        onClose={() => {
          setShow2FAModal(false)
          setUserId2FA('')
        }}
        onSuccess={handle2FASuccess}
      />
    </div>
  )
}
