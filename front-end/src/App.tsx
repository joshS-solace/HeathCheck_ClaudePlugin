import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import BrokerContextPage from './pages/BrokerContextPage'
import ResultsPage from './pages/ResultsPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/broker-context" element={<BrokerContextPage />} />
        <Route path="/results" element={<ResultsPage />} />
      </Routes>
    </Router>
  )
}

export default App
