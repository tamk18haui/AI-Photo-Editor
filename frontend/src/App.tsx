
import { useEffect, useState } from 'react'
import { apiClient } from './services/apiClient'

type HealthResponse = {
  status: string
  message: string
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiClient.get<HealthResponse>('/health')
      .then((response) => {
        setHealth(response.data)
      })
      .catch(() => {
        setError('Không thể kết nối Backend')
      })
  }, [])

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>AI Photo Editor</h1>
      <h2>Kiểm tra kết nối Frontend - Backend</h2>

      {health && (
        <>
          <p>Trạng thái: {health.status}</p>
          <p>Thông báo: {health.message}</p>
        </>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!health && !error && <p>Đang kết nối...</p>}
    </div>
  )
}

export default App
