
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type SupportRequest = {
  request_id: string
  customer_email: string
  order_number: string | null
  request_type: string
  description: string
  status: string
  created_at: string
}

const allowedStatuses = ['Open', 'In Progress', 'Resolved']

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Hello! Welcome to AI Customer Support. How can I help you today?',
    },
  ])

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [requestType, setRequestType] = useState('complaint')
  const [requestDescription, setRequestDescription] = useState('')
  const [error, setError] = useState('')

  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardMessage, setDashboardMessage] = useState('')

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const message = input.trim()
    if (!message || loading) return

    setMessages((previous) => [
      ...previous,
      { role: 'user', content: message },
    ])
    setInput('')
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          order_number: orderNumber.trim(),
          customer_email: customerEmail.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail || `Request failed (${response.status}).`,
        )
      }

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content: data.reply || 'I could not generate a response.',
        },
      ])
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not connect to the support service. Check that the backend is running.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function submitSupportRequest() {
    if (loading) return

    if (!customerEmail.trim()) {
      setError('Please enter your email address first.')
      return
    }

    if (!requestDescription.trim()) {
      setError('Please describe your complaint or return request.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/support-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_email: customerEmail.trim(),
          request_type: requestType,
          description: requestDescription.trim(),
          order_number: orderNumber.trim() || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail || 'Could not submit your support request.',
        )
      }

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content:
            `Your support request has been recorded. ` +
            `Reference: ${data.request_id}. ` +
            `Status: ${data.status}. ` +
            'This does not mean a return or refund has been approved.',
        },
      ])

      setRequestDescription('')
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not submit your support request.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadSupportRequests() {
    setDashboardLoading(true)
    setDashboardError('')
    setDashboardMessage('')

    try {
      const response = await fetch(`${API_URL}/support-requests`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail || 'Could not load support requests.',
        )
      }

      setSupportRequests(data)
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : 'Could not connect to the backend.',
      )
    } finally {
      setDashboardLoading(false)
    }
  }

  useEffect(() => {
    void loadSupportRequests()
  }, [])

  async function updateRequestStatus(
    requestId: string,
    status: string,
  ) {
    setDashboardError('')
    setDashboardMessage('')

    try {
      const response = await fetch(
        `${API_URL}/support-requests/${encodeURIComponent(requestId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.detail || 'Could not update request status.',
        )
      }

      setSupportRequests((previous) =>
        previous.map((request) =>
          request.request_id === requestId
            ? { ...request, status: data.status }
            : request,
        ),
      )

      setDashboardMessage(
        `Request ${requestId} updated to ${data.status}.`,
      )
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : 'Could not update the request.',
      )
    }
  }

  const openCount = supportRequests.filter(
    (request) => request.status === 'Open',
  ).length

  const inProgressCount = supportRequests.filter(
    (request) => request.status === 'In Progress',
  ).length

  const resolvedCount = supportRequests.filter(
    (request) => request.status === 'Resolved',
  ).length

  return (
    <main className="app-shell">
      <section className="chat-card">
        <header className="chat-header">
          <div className="brand-icon">CS</div>

          <div className="brand-info">
            <h1>Customer Support</h1>
            <p>
              <span className="status-dot" /> AI Assistant · Online
            </p>
          </div>

          <span className="header-label">SUPPORT</span>
        </header>

        <div className="welcome-panel">
          <span className="eyebrow">HERE TO HELP</span>
          <h2>How can we help you?</h2>
          <p>
            Ask a question and our AI support assistant will help you
            find an answer.
          </p>
        </div>

        <div className="messages" aria-live="polite">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`message-row ${
                message.role === 'user' ? 'user-row' : ''
              }`}
            >
              {message.role === 'assistant' && (
                <div className="avatar">AI</div>
              )}

              <div className={`message-bubble ${message.role}`}>
                {message.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-row">
              <div className="avatar">AI</div>
              <div className="message-bubble assistant typing">
                Processing your request...
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        <div className="suggestions">
          <button
            type="button"
            onClick={() =>
              setInput('My product arrived damaged. What should I do?')
            }
            disabled={loading}
          >
            Damaged product
          </button>

          <button
            type="button"
            onClick={() =>
              setInput('How can I get help with my order?')
            }
            disabled={loading}
          >
            Order assistance
          </button>

          <button
            type="button"
            onClick={() =>
              setInput('I would like to ask about your return policy.')
            }
            disabled={loading}
          >
            Returns
          </button>
        </div>

        <div className="order-details">
          <input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="Order number (e.g. ORD1001)"
            aria-label="Order number"
            disabled={loading}
          />

          <input
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            placeholder="Email used for the order"
            aria-label="Customer email"
            disabled={loading}
          />
        </div>

        <form className="message-form" onSubmit={sendMessage}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type your question here..."
            aria-label="Your support question"
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>

        <div className="support-request-form">
          <h3>Submit a Support Request</h3>

          <label htmlFor="request-type">Request type</label>
          <select
            id="request-type"
            value={requestType}
            onChange={(event) => setRequestType(event.target.value)}
            disabled={loading}
          >
            <option value="complaint">General complaint</option>
            <option value="return">Return request</option>
            <option value="damaged_product">Damaged product</option>
          </select>

          <label htmlFor="request-description">
            Describe your request
          </label>
          <textarea
            id="request-description"
            value={requestDescription}
            onChange={(event) =>
              setRequestDescription(event.target.value)
            }
            placeholder="Describe your complaint or return request..."
            rows={3}
            disabled={loading}
          />

          <button
            type="button"
            onClick={submitSupportRequest}
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Submit Support Request'}
          </button>
        </div>

        <footer className="chat-footer">
          AI-generated answers may need verification. Avoid sharing
          passwords or payment details.
        </footer>
      </section>

      <section className="support-dashboard">
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">ADMINISTRATION</span>
            <h2>Support Dashboard</h2>
            <p>Review customer requests and manage their status.</p>
          </div>

          <button
            type="button"
            onClick={loadSupportRequests}
            disabled={dashboardLoading}
          >
            {dashboardLoading ? 'Loading...' : 'Refresh Requests'}
          </button>
        </header>

        <div className="dashboard-stats">
          <article className="dashboard-stat">
            <span>Total Requests</span>
            <strong>{supportRequests.length}</strong>
          </article>

          <article className="dashboard-stat">
            <span>Open</span>
            <strong>{openCount}</strong>
          </article>

          <article className="dashboard-stat">
            <span>In Progress</span>
            <strong>{inProgressCount}</strong>
          </article>

          <article className="dashboard-stat">
            <span>Resolved</span>
            <strong>{resolvedCount}</strong>
          </article>
        </div>

        {dashboardError && (
          <p className="error-message" role="alert">
            {dashboardError}
          </p>
        )}

        {dashboardMessage && (
          <p role="status">{dashboardMessage}</p>
        )}

        {dashboardLoading && supportRequests.length === 0 ? (
          <p>Loading support requests...</p>
        ) : supportRequests.length === 0 ? (
          <p>No support requests have been submitted yet.</p>
        ) : (
          <div className="requests-list">
            {supportRequests.map((request) => (
              <article
                className="request-card"
                key={request.request_id}
              >
                <div className="request-card-header">
                  <div>
                    <h3>{request.request_id}</h3>
                    <p>{request.customer_email}</p>
                  </div>

                  <span className="request-status">
                    {request.status}
                  </span>
                </div>

                <p>
                  <strong>Type:</strong>{' '}
                  {request.request_type.replaceAll('_', ' ')}
                </p>

                <p>
                  <strong>Order:</strong>{' '}
                  {request.order_number || 'Not provided'}
                </p>

                <p>
                  <strong>Description:</strong>{' '}
                  {request.description}
                </p>

                <p>
                  <strong>Submitted:</strong>{' '}
                  {request.created_at}
                </p>

                <label htmlFor={`status-${request.request_id}`}>
                  Update status
                </label>

                <select
                  id={`status-${request.request_id}`}
                  value={request.status}
                  onChange={(event) =>
                    void updateRequestStatus(
                      request.request_id,
                      event.target.value,
                    )
                  }
                  disabled={dashboardLoading}
                >
                  {allowedStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </article>
            ))}
          </div>
        )}

        <p className="chat-footer">
          Demo dashboard: administrator authentication is not yet
          configured. Do not expose customer requests publicly until
          access controls are implemented.
        </p>
      </section>
    </main>
  )
}

export default App
