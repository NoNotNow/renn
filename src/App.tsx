import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Builder from '@/pages/Builder'
import Play from '@/pages/Play'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ProjectProvider>
          <Routes>
            <Route path="/" element={<Builder />} />
            <Route path="/play" element={<Play />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ProjectProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
