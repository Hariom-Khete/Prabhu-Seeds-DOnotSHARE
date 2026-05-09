import { useEffect, useRef, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Map, useMap, useMapsLibrary, useApiLoadingStatus } from '@vis.gl/react-google-maps'
import GoogleMapProvider from '@/components/maps/GoogleMapProvider'
import { useTravelRoute } from '../hooks/useTravel'

const MIN_ROUTE_KM = 1

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(a, b) {
  const R = 6371
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function totalKm(points) {
  let km = 0
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i])
  return km
}

function boundingCenter(points) {
  if (!points.length) return { lat: 23.2599, lng: 77.4126 }
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length
  return { lat, lng }
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 *
 * Keeps the points that contribute most to the *shape* of the path
 * (turns, bends) and drops redundant points on straight stretches.
 * epsilon is in degrees — 0.0001° ≈ 11 m at Indian latitudes.
 */
function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return [...points]

  const start = points[0]
  const end   = points[points.length - 1]
  const dx    = end.lng - start.lng
  const dy    = end.lat - start.lat
  const lenSq = dx * dx + dy * dy

  let maxDist = 0
  let maxIdx  = 0

  for (let i = 1; i < points.length - 1; i++) {
    let dist
    if (lenSq === 0) {
      const dlat = points[i].lat - start.lat
      const dlng = points[i].lng - start.lng
      dist = Math.sqrt(dlat * dlat + dlng * dlng)
    } else {
      // Perpendicular distance from point to the start→end line
      const t       = ((points[i].lat - start.lat) * dy + (points[i].lng - start.lng) * dx) / lenSq
      const projLat = start.lat + t * dy
      const projLng = start.lng + t * dx
      const dlat    = points[i].lat - projLat
      const dlng    = points[i].lng - projLng
      dist = Math.sqrt(dlat * dlat + dlng * dlng)
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }

  if (maxDist > epsilon) {
    const left  = rdpSimplify(points.slice(0, maxIdx + 1), epsilon)
    const right = rdpSimplify(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [start, end]
}

/**
 * Reduce points to at most maxPoints using RDP with binary-searched epsilon.
 *
 * Binary search finds the smallest epsilon that brings point count to <= maxPoints,
 * maximising shape fidelity — turns and bends are kept, straight stretches thinned.
 *
 * DirectionsService limit: 25 total (origin + 23 intermediate + destination).
 */
function smartSample(points, maxPoints = 25) {
  if (points.length <= maxPoints) return points

  let lo = 0
  let hi = 0.5   // 0.5° ≈ 55 km — large enough for any Indian journey
  let best = [points[0], points[points.length - 1]]

  for (let iter = 0; iter < 24; iter++) {
    const mid        = (lo + hi) / 2
    const simplified = rdpSimplify(points, mid)
    if (simplified.length <= maxPoints) {
      best = simplified
      hi   = mid
    } else {
      lo = mid
    }
  }

  return best.length >= 2 ? best : [points[0], points[points.length - 1]]
}

// ── Road-snapped directions component ────────────────────────────────────────

function RoadRoute({ path, onFallback }) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')
  const rendererRef = useRef(null)

  useEffect(() => {
    if (!routesLib || !map) return

    const renderer = new routesLib.DirectionsRenderer({
      suppressMarkers: false,        // show Google's A / B markers
      preserveViewport: false,       // auto-fit map to the route
      polylineOptions: {
        strokeColor: '#0d631b',
        strokeWeight: 4,
        strokeOpacity: 0.85,
      },
    })
    renderer.setMap(map)
    rendererRef.current = renderer

    return () => {
      renderer.setMap(null)
      rendererRef.current = null
    }
  }, [routesLib, map])

  useEffect(() => {
    if (!routesLib || !rendererRef.current || path.length < 2) return

    const service = new routesLib.DirectionsService()
    const sampled  = smartSample(path, 25)

    const origin      = sampled[0]
    const destination = sampled[sampled.length - 1]
    const waypoints   = sampled.slice(1, -1).map((p) => ({
      location: { lat: p.lat, lng: p.lng },
      stopover: false,
    }))

    service.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: routesLib.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === 'OK') {
          rendererRef.current?.setDirections(result)
        } else {
          // Directions API failed — tell parent to fall back to raw polyline
          console.warn('DirectionsService failed:', status)
          onFallback?.()
        }
      },
    )
  }, [routesLib, path, onFallback])

  return null
}

// ── Fallback raw polyline (if Directions API fails) ───────────────────────────

function RawPolyline({ path }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !window.google || path.length < 2) return

    const polyline = new window.google.maps.Polyline({
      path,
      strokeColor: '#0d631b',
      strokeWeight: 4,
      strokeOpacity: 0.85,
      map,
    })

    // A marker
    const startMarker = new window.google.maps.Marker({
      position: path[0],
      map,
      label: { text: 'A', color: 'white', fontWeight: 'bold' },
    })

    // B marker
    const endMarker = new window.google.maps.Marker({
      position: path[path.length - 1],
      map,
      label: { text: 'B', color: 'white', fontWeight: 'bold' },
    })

    return () => {
      polyline.setMap(null)
      startMarker.setMap(null)
      endMarker.setMap(null)
    }
  }, [map, path])

  return null
}

// ── Map canvas ────────────────────────────────────────────────────────────────

function MapCanvas({ path, center, heightClass }) {
  const status = useApiLoadingStatus()
  const [useFallback, setUseFallback] = useState(false)

  if (status === 'FAILED') {
    return (
      <NoRouteMessage
        heightClass={heightClass}
        reason="Google Maps could not be loaded. Check the API key configuration."
      />
    )
  }

  if (status === 'LOADING' || status === 'NOT_LOADED') {
    return (
      <div className={`w-full ${heightClass} bg-surface-container-low flex items-center justify-center gap-2 text-sm text-on-surface-variant`}>
        <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Loading map…
      </div>
    )
  }

  return (
    <Map
      defaultCenter={center}
      defaultZoom={12}
      disableDefaultUI
      gestureHandling="greedy"
      mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
    >
      {useFallback
        ? <RawPolyline path={path} />
        : <RoadRoute path={path} onFallback={() => setUseFallback(true)} />
      }
    </Map>
  )
}

// ── No-data placeholder ───────────────────────────────────────────────────────

function NoRouteMessage({ heightClass, reason }) {
  return (
    <div className={`w-full ${heightClass} bg-surface-container-low flex flex-col items-center justify-center gap-2`}>
      <span className="material-symbols-outlined text-3xl text-on-surface-variant/40" aria-hidden="true">location_off</span>
      <p className="text-sm font-semibold text-on-surface-variant">No route data available.</p>
      <p className="text-xs text-on-surface-variant/60">{reason}</p>
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export default function TravelRouteMap({ expenseId, heightClass = 'h-[420px]' }) {
  const { data, isLoading } = useTravelRoute(expenseId)

  const path = useMemo(() => {
    if (!Array.isArray(data) || !data.length) return []
    return data.map((w) => ({ lat: Number(w.lat), lng: Number(w.lng) }))
  }, [data])

  const distanceKm = useMemo(() => (path.length > 1 ? totalKm(path) : 0), [path])
  const center     = useMemo(() => boundingCenter(path), [path])

  const startTime = data?.[0]?.timestamp
  const endTime   = data?.[data.length - 1]?.timestamp

  if (isLoading) {
    return (
      <div className={`w-full ${heightClass} bg-surface-container-low flex items-center justify-center gap-2 text-sm text-on-surface-variant`}>
        <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Checking for route data…
      </div>
    )
  }

  if (!path.length) {
    return (
      <NoRouteMessage
        heightClass={heightClass}
        reason="GPS waypoints were not recorded on this journey day."
      />
    )
  }

  if (distanceKm < MIN_ROUTE_KM) {
    return (
      <NoRouteMessage
        heightClass={heightClass}
        reason={`Total distance (${(distanceKm * 1000).toFixed(0)} m) is under 1 km — no meaningful route to display.`}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className={`${heightClass} bg-surface-container-lowest overflow-hidden`}>
        <GoogleMapProvider fallbackClassName={heightClass}>
          <MapCanvas
            path={path}
            center={center}
            heightClass={heightClass}
          />
        </GoogleMapProvider>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="px-3 py-1.5 bg-surface-container-low text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          Distance: {distanceKm.toFixed(1)} km
        </span>
        <span className="px-3 py-1.5 bg-surface-container-low text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          Waypoints: {path.length}
        </span>
        {startTime && (
          <span className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
            {format(new Date(startTime), 'hh:mm a')} → {endTime ? format(new Date(endTime), 'hh:mm a') : '--'}
          </span>
        )}
      </div>
    </div>
  )
}
