import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Builder from '@/pages/Builder'
import Play from '@/pages/Play'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Builder />} />
        <Route path="/play" element={<Play />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
