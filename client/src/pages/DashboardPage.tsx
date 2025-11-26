import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketStore } from '../stores/socket'
import { Activity, Server, Database, Wifi } from 'lucide-react'
import { statsApi, type DashboardStats } from '../lib/api'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const socket = useSocketStore((state) => state.socket)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch dashboard stats
  const fetchStats = async () => {
    try {
      const response = await statsApi.dashboard()
      setStats(response.data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
      toast.error(t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()

    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000)

    if (socket) {
      socket.on('device:status', () => {
        // Refresh stats when device status changes
        fetchStats()
      })
    }

    return () => {
      clearInterval(interval)
      if (socket) {
        socket.off('device:status')
      }
    }
  }, [socket])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t('loading')}</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t('noData')}</div>
      </div>
    )
  }

  const cards = [
    {
      title: t('totalDevices'),
      value: stats.devices.total,
      icon: Server,
      color: 'bg-blue-500',
    },
    {
      title: t('onlineDevices'),
      value: stats.devices.online,
      icon: Wifi,
      color: 'bg-green-500',
    },
    {
      title: t('totalFiles'),
      value: stats.files.total,
      icon: Database,
      color: 'bg-purple-500',
    },
    {
      title: t('storageUsed'),
      value: stats.storage.formatted,
      icon: Activity,
      color: 'bg-orange-500',
      isString: true,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${card.color}`}>
                <card.icon className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-1">{card.title}</p>
            <p className="text-3xl font-bold text-gray-900">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">{t('filesUploadedToday')}</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.files.uploadedToday}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">{t('deviceEvents24h')}</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.activity.deviceEvents24h}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">{t('totalUsers')}</h3>
          <p className="text-2xl font-bold text-gray-900">{stats.users.total}</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('recentActivity')}</h2>
        {stats.recentActivities.length === 0 ? (
          <p className="text-gray-500 text-center py-4">{t('noRecentActivity')}</p>
        ) : (
          // Constrain the activity list and make it scrollable so it doesn't push the page
          // Use responsive max heights so desktop shows more items while mobile stays compact
          <div className="max-h-[28rem] md:max-h-96 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            {stats.recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={`h-2 w-2 rounded-full ${activity.success ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                <p className="text-sm text-gray-700">
                  <span className="font-medium">{activity.user}</span> {activity.action}
                  {activity.resource && <span> on {activity.resource}</span>}
                </p>
                <span className="ml-auto text-xs text-gray-500">
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

