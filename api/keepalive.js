export default async function handler(req, res) {
  const backendUrl = process.env.VITE_BACKEND_URL
  if (!backendUrl) {
    return res.status(200).json({ status: 'no backend url configured' })
  }
  try {
    const response = await fetch(`${backendUrl}/health`)
    const data = await response.json()
    res.status(200).json({ status: 'ok', backend: data })
  } catch (err) {
    res.status(200).json({ status: 'ping failed', error: err.message })
  }
}
