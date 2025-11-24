import { useState, useEffect } from 'react'
import { Smartphone, Circle, Edit2 } from 'lucide-react'
import { api } from '../lib/api'
import { useSocketStore } from '../stores/socket'
import toast from 'react-hot-toast'

interface Device {
  id: string
  deviceName: string
  deviceId: string
  ipAddress: string | null
  macAddress: string | null
  androidVersion: string | null
  appVersion: string | null
  isOnline: boolean
  lastSeen: string
  registeredAt: string
  updatedAt: string
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  // ticking state to force periodic re-render so relative "Last Seen" updates
  // for offline devices stay current without refetching data.
  const [tick, setTick] = useState<number>(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [editingDevice, setEditingDevice] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const socket = useSocketStore((state) => state.socket)

  // Fetch devices from API
  const fetchDevices = async () => {
    try {
      // fetch all devices (online + offline)
      const response = await api.get<{ devices: Device[] }>('/api/devices')
      setDevices(response.data.devices)
    } catch (error) {
      console.error('Failed to fetch devices:', error)
      toast.error('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  // update `tick` every minute so the UI refreshes relative times like "5 minutes ago"
  // for offline devices. We purposely only update a small piece of state to avoid
  // refetching or heavy work.
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(Date.now())
    }, 60_000) // 60s

    return () => clearInterval(interval)
  }, [])

  // Listen for real-time device updates via Socket.IO
  useEffect(() => {
    if (!socket) return

    // server emits an array of currently online devices. Merge that into
    // the full device list so offline devices remain visible.
    const handleDevicesList = (onlineDevices: Device[]) => {
      console.log('📱 Devices updated (online list):', onlineDevices)
      setDevices((prev) => {
        const nowIso = new Date().toISOString()
        const byId = new Map<string, Device>()

        // start with previous devices (clone to avoid mutating originals)
        for (const d of prev) {
          byId.set(d.id, { ...d, isOnline: false })
        }

        // apply online devices updates
        for (const od of onlineDevices) {
          const existing = byId.get(od.id)
          if (existing) {
            // merge known fields and mark online
            byId.set(od.id, {
              ...existing,
              deviceName: od.deviceName || existing.deviceName,
              ipAddress: od.ipAddress ?? existing.ipAddress,
              macAddress: od.macAddress ?? existing.macAddress,
              androidVersion: od.androidVersion ?? existing.androidVersion,
              appVersion: od.appVersion ?? existing.appVersion,
              isOnline: true,
              // server may include lastSeen; otherwise use now
              lastSeen: od.lastSeen || nowIso,
              updatedAt: od.updatedAt || existing.updatedAt,
            })
          } else {
            // new device not present in prev list - add it
            byId.set(od.id, { ...od, isOnline: true, lastSeen: od.lastSeen || nowIso })
          }
        }

        // return array sorted: online first, then offline by lastSeen desc
        const merged = Array.from(byId.values())
        merged.sort((a, b) => {
          if (a.isOnline === b.isOnline) {
            return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
          }
          return a.isOnline ? -1 : 1
        })

        return merged
      })
    }

    socket.on('devices:list', handleDevicesList)

    return () => {
      socket.off('devices:list', handleDevicesList)
    }
  }, [socket])

  // Handle rename device
  const handleRename = async (deviceId: string) => {
    if (!newName.trim()) {
      toast.error('Please enter a device name')
      return
    }

    try {
      await api.put(`/api/devices/${deviceId}/name`, {
        deviceName: newName.trim(),
      })
      toast.success('Device renamed successfully')
      setEditingDevice(null)
      setNewName('')
      fetchDevices()
    } catch (error) {
      console.error('Failed to rename device:', error)
      toast.error('Failed to rename device')
    }
  }

  // Format relative time - show "Now" if online, otherwise show time ago
  const formatLastSeen = (lastSeen: string, isOnline: boolean) => {
    if (isOnline) {
      return 'Now'
    }

    const date = new Date(lastSeen)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) return 'Just now'
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  // Determine device type: prefer explicit androidVersion, otherwise inspect deviceName/deviceId
  const getDeviceType = (device: Device): 'Android' | 'Browser' => {
    // If server provides androidVersion, treat as Android
    if (device.androidVersion) return 'Android'

    // Heuristics: deviceId or deviceName containing 'android' -> Android
    const id = (device.deviceId || '').toLowerCase()
    const name = (device.deviceName || '').toLowerCase()
    if (id.includes('android') || name.includes('android')) return 'Android'

    // Default to Browser
    return 'Browser'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading devices...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Devices</h2>
          {(() => {
            const onlineCount = devices.filter((d) => d.isOnline).length
            const total = devices.length
            // include `tick` to ensure the periodic updater state is referenced
            // which forces a re-render for relative times without lint errors.
            void tick
            return (
              <p className="text-sm text-gray-500 mt-1">
                Real-time connected devices ({onlineCount} online, {total} total)
              </p>
            )
          })()}
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Smartphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No devices connected</h3>
          <p className="text-gray-500">
            Devices will appear here when they connect via Socket.IO
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            <div
              key={device.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Smartphone className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingDevice === device.id ? (
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') handleRename(device.id)
                        }}
                        className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter device name"
                        autoFocus
                      />
                    ) : (
                      <h3 className="font-semibold text-gray-900 truncate">
                        {device.deviceName}
                      </h3>
                    )}
                    <p className="text-sm text-gray-500 truncate">
                      {device.ipAddress || 'Unknown IP'}
                    </p>
                  </div>
                </div>
                <Circle
                  className={`h-3 w-3 flex-shrink-0 ${device.isOnline
                      ? 'fill-green-500 text-green-500'
                      : 'fill-gray-300 text-gray-300'
                    }`}
                />
              </div>

              <div className="pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Device Type</span>
                  <span className="font-medium text-gray-700">{getDeviceType(device)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <span
                    className={`font-medium ${device.isOnline ? 'text-green-600' : 'text-gray-400'
                      }`}
                  >
                    {device.isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Last Seen</span>
                  <span className={`font-medium ${device.isOnline ? 'text-green-600' : 'text-gray-700'}`}>
                    {formatLastSeen(device.lastSeen, device.isOnline)}
                  </span>
                </div>
                {device.androidVersion && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Android</span>
                    <span className="text-gray-700">{device.androidVersion}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-gray-100 flex gap-2">
                {editingDevice === device.id ? (
                  <>
                    <button
                      onClick={() => handleRename(device.id)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingDevice(null)
                        setNewName('')
                      }}
                      className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setEditingDevice(device.id)
                      setNewName(device.deviceName)
                    }}
                    className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Edit2 className="h-4 w-4" />
                    Rename
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
