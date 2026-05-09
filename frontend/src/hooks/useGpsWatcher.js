/**
 * useGpsWatcher — hybrid distance + heartbeat GPS tracker.
 *
 * Uses navigator.geolocation.watchPosition() (fires on device movement).
 * Before POSTing a waypoint we apply two filters so the DB doesn't get
 * flooded with duplicate coordinates:
 *
 *   1. Distance gate  — only post if moved ≥ MIN_DISTANCE_M from last post
 *   2. Heartbeat gate — always post if MIN_HEARTBEAT_MS has elapsed (keeps
 *                       "last seen" timestamp fresh for live tracking)
 *
 * Active only while `enabled` is true (i.e. field staff is checked in).
 * Silently swallows network errors so a bad connection never alerts the user.
 */
import { useEffect, useRef } from 'react'
import apiClient from '@/lib/axios'

const MIN_DISTANCE_M  = 100          // post if moved > 100 m
const MIN_HEARTBEAT_MS = 5 * 60_000  // post at least every 5 minutes

/** Haversine distance in metres between two lat/lng pairs. */
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * @param {object} params
 * @param {number|null} params.attendanceId  — today's Attendance row id (from /attendance/today)
 * @param {boolean}     params.enabled       — true while the user is checked in
 */
export function useGpsWatcher({ attendanceId, enabled = false }) {
  // last successfully posted position + timestamp
  const lastPostRef = useRef(null)  // { lat, lng, ts }
  const watchIdRef  = useRef(null)

  useEffect(() => {
    if (!enabled || !attendanceId) return
    if (!navigator.geolocation) return

    function handlePosition(pos) {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords

      // Reject clearly invalid coordinates
      if (lat === 0 && lng === 0) return

      // Reject very low-accuracy fixes (> 3 km) — typical of IP-based fallback on laptops.
      // Real GPS is usually < 50 m; WiFi < 200 m; cell < 2000 m.
      if (accuracy > 3000) return

      const now = Date.now()
      const last = lastPostRef.current

      const moved = last
        ? haversineM(last.lat, last.lng, lat, lng) >= MIN_DISTANCE_M
        : true  // first fix — always post

      const heartbeat = last ? now - last.ts >= MIN_HEARTBEAT_MS : true

      if (!moved && !heartbeat) return  // neither condition met → skip

      // Optimistically update ref before the request so rapid fixes don't
      // trigger duplicate posts while the first one is still in flight.
      lastPostRef.current = { lat, lng, ts: now }

      apiClient
        .post('/api/v1/attendance/waypoints', {
          attendance_id: attendanceId,
          lat,
          lng,
          timestamp: new Date(now).toISOString(),
          type: 'stop',
        })
        .catch(() => {
          // Network failure — revert so the next fix retries the post
          lastPostRef.current = last
        })
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      null, // errors are non-fatal; GPS unavailable just means no waypoints
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,   // accept a cached fix up to 30 s old
        timeout: 15_000,
      },
    )

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      lastPostRef.current = null
    }
  }, [enabled, attendanceId])
}
