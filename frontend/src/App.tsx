import { useState } from 'react'
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
type View = 'chat' | 'dashboard'

function App() {
  const [activeView, setActiveView] = useState<View>('chat')
  const [adminToken, setAdminToken] = useState('')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! Welcome to AI Customer Support. How can I help you today?',
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

    setMessages((previous) => [...previous, { role: 'user', content: message }])
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
        throw new Error(data.detail || `Request failed (${response.status}).`)
      }
      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: data.reply || 'I could not generate a response.' },
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
        throw new Error(data.detail || 'Could not submit your support request.')
      }

      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content:
            `Your support request has been recorded. Reference: ${data.request_id}. ` +
            `Status: ${data.status}. This does not mean a return or refund has been approved.`,
        },
      ])
      setRequestDescription('')
      void loadSupportRequests()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not submit your support request.')
    } finally {
      setLoading(false)
    }
  }

  async function loginAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loginLoading) return

    setLoginLoading(true)
    setLoginError('')
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'Administrator login failed.')
      }
      if (typeof data.access_token !== 'string' || !data.access_token) {
        throw new Error('The server did not return an access token.')
      }

      setAdminToken(data.access_token)
      setLoginPassword('')
      setLoginError('')
      setActiveView('dashboard')
      await loadSupportRequests(data.access_token)
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : 'Could not connect to the backend.',
      )
    } finally {
      setLoginLoading(false)
    }
  }

  async function loadSupportRequests(tokenOverride?: string) {
    const token = tokenOverride || adminToken
    if (!token) return

    setDashboardLoading(true)
    setDashboardError('')
    setDashboardMessage('')
    try {
      const response = await fetch(`${API_URL}/support-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setAdminToken('')
          setActiveView('dashboard')
          setLoginError('Your administrator session has expired. Please log in again.')
        }
        throw new Error(data.detail || 'Could not load support requests.')
      }
      setSupportRequests(data)
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : 'Could not connect to the backend.',
      )
    } finally {
      setDashboardLoading(false)
    }
  }

  async function updateRequestStatus(requestId: string, status: string) {
    setDashboardError('')
    setDashboardMessage('')
    try {
      const response = await fetch(
        `${API_URL}/support-requests/${encodeURIComponent(requestId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ status }),
        },
      )
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setAdminToken('')
          setLoginError('Your administrator session has expired. Please log in again.')
        }
        throw new Error(data.detail || 'Could not update request status.')
      }
      setSupportRequests((previous) =>
        previous.map((request) =>
          request.request_id === requestId ? { ...request, status: data.status } : request,
        ),
      )
      setDashboardMessage(`Request ${requestId} updated to ${data.status}.`)
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Could not update the request.')
    }
  }

  const openCount = supportRequests.filter((request) => request.status === 'Open').length
  const inProgressCount = supportRequests.filter((request) => request.status === 'In Progress').length
  const resolvedCount = supportRequests.filter((request) => request.status === 'Resolved').length

  if (activeView === 'dashboard' && !adminToken) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <div className="admin-login-brand">
            <div className="brand-icon">CS</div>
            <div>
              <strong>SupportDesk</strong>
              <span>Administrator access</span>
            </div>
          </div>
          <span className="eyebrow">SECURE WORKSPACE</span>
          <h1 id="admin-login-title">Administrator login</h1>
          <p className="admin-login-description">
            Sign in to view customer support requests and manage their status.
          </p>
          <form className="admin-login-form" onSubmit={loginAdmin}>
            <label htmlFor="admin-username">Username</label>
            <input
              id="admin-username"
              autoComplete="username"
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              placeholder="Enter administrator username"
              required
              disabled={loginLoading}
            />
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Enter administrator password"
              required
              disabled={loginLoading}
            />
            {loginError && <p className="error-message" role="alert">{loginError}</p>}
            <button className="primary-button admin-login-submit" type="submit" disabled={loginLoading}>
              {loginLoading ? 'Signing in...' : 'Sign in securely'}
            </button>
          </form>
          <button
            className="back-to-chat-button"
            type="button"
            onClick={() => {
              setLoginError('')
              setActiveView('chat')
            }}
          >
            Back to customer chat
          </button>
          <p className="admin-login-footnote">Administrator credentials are verified by the secure backend.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">CS</div>
          <div>
            <strong>SupportDesk</strong>
            <span>Customer service</span>
          </div>
        </div>

        <p className="sidebar-label">WORKSPACE</p>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <button
            type="button"
            className={activeView === 'chat' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveView('chat')}
          >
            <span className="nav-symbol">C</span>
            Chat Support
          </button>
          <button
            type="button"
            className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setActiveView('dashboard')
              if (adminToken) void loadSupportRequests()
            }}
          >
            <span className="nav-symbol">D</span>
            Support Dashboard
          </button>
        </nav>

        <div className="sidebar-bottom">
          <span className="online-indicator" />
          <div>
            <strong>AI Assistant</strong>
            <span>Service workspace</span>
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <p className="topbar-eyebrow">CUSTOMER SERVICE WORKSPACE</p>
            <h1>{activeView === 'chat' ? 'Chat Support' : 'Support Dashboard'}</h1>
          </div>
          <div className="topbar-actions">
            {adminToken && activeView === 'dashboard' && (
              <button
                className="logout-button"
                type="button"
                onClick={() => {
                  setAdminToken('')
                  setSupportRequests([])
                  setDashboardError('')
                  setDashboardMessage('')
                  setLoginPassword('')
                  setLoginError('')
                  setActiveView('chat')
                }}
              >
                Log out
              </button>
            )}
            <span className="topbar-status"><span className="online-indicator" /> System online</span>
          </div>
        </header>

        {activeView === 'chat' ? (
          <section className="content-area">
            <div className="page-intro">
              <span className="eyebrow">HERE TO HELP</span>
              <h2>How can we help you?</h2>
              <p>Ask a question and our AI support assistant will help you find an answer.</p>
            </div>

            <div className="chat-card">
              <header className="chat-header">
                <div className="brand-icon">AI</div>
                <div className="brand-info">
                  <h2>AI Customer Support</h2>
                  <p><span className="status-dot" /> Assistant available</p>
                </div>
                <span className="header-label">LIVE CHAT</span>
              </header>

              <div className="messages" aria-live="polite">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`message-row ${message.role === 'user' ? 'user-row' : ''}`}
                  >
                    {message.role === 'assistant' && <div className="avatar">AI</div>}
                    <div className={`message-bubble ${message.role}`}>
                      {message.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="message-row">
                    <div className="avatar">AI</div>
                    <div className="message-bubble assistant typing">Processing your request...</div>
                  </div>
                )}
              </div>

              {error && <p className="error-message" role="alert">{error}</p>}

              <div className="chat-tools">
                <p className="field-section-title">Quick questions</p>
                <div className="suggestions">
                  <button type="button" onClick={() => setInput('My product arrived damaged. What should I do?')} disabled={loading}>Damaged product</button>
                  <button type="button" onClick={() => setInput('How can I get help with my order?')} disabled={loading}>Order assistance</button>
                  <button type="button" onClick={() => setInput('I would like to ask about your return policy.')} disabled={loading}>Returns</button>
                </div>

                <div className="order-details">
                  <label>
                    Order number
                    <input
                      value={orderNumber}
                      onChange={(event) => setOrderNumber(event.target.value)}
                      placeholder="e.g. ORD1001"
                      aria-label="Order number"
                      disabled={loading}
                    />
                  </label>
                  <label>
                    Email used for order
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      placeholder="you@example.com"
                      aria-label="Customer email"
                      disabled={loading}
                    />
                  </label>
                </div>

                <form className="message-form" onSubmit={sendMessage}>
                  <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Type your question here..."
                    aria-label="Your support question"
                    disabled={loading}
                  />
                  <button type="submit" disabled={loading || !input.trim()}>
                    {loading ? 'Sending...' : 'Send'}
                  </button>
                </form>
              </div>
              <footer className="chat-footer">
                AI-generated answers may need verification. Never share passwords or payment details.
              </footer>
            </div>

            <section className="support-request-form">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">NEED MORE HELP?</span>
                  <h3>Submit a support request</h3>
                  <p>Send your issue to our support team for follow-up.</p>
                </div>
              </div>
              <div className="request-form-grid">
                <label htmlFor="request-type">Request type</label>
                <select id="request-type" value={requestType} onChange={(event) => setRequestType(event.target.value)} disabled={loading}>
                  <option value="complaint">General complaint</option>
                  <option value="return">Return request</option>
                  <option value="damaged_product">Damaged product</option>
                </select>
                <label htmlFor="request-description">Describe your request</label>
                <textarea
                  id="request-description"
                  value={requestDescription}
                  onChange={(event) => setRequestDescription(event.target.value)}
                  placeholder="Describe your complaint or return request..."
                  rows={4}
                  disabled={loading}
                />
                <div className="form-action">
                  <button className="primary-button" type="button" onClick={submitSupportRequest} disabled={loading}>
                    {loading ? 'Submitting...' : 'Submit support request'}
                  </button>
                </div>
              </div>
            </section>
          </section>
        ) : (
          <section className="content-area dashboard-content">
            <div className="dashboard-welcome">
              <div>
                <span className="eyebrow">OVERVIEW</span>
                <h2>Support request overview</h2>
                <p>Review incoming customer issues and track their progress.</p>
              </div>
              <button
              className="primary-button"
              type="button"
              onClick={() => void loadSupportRequests()}
              disabled={dashboardLoading}
              >
  {dashboardLoading ? 'Refreshing...' : 'Refresh requests'}
</button>
            </div>

            {dashboardError && <p className="alert-message" role="alert">{dashboardError}</p>}
            {dashboardMessage && <p className="success-message" role="status">{dashboardMessage}</p>}

            <div className="dashboard-stats">
              <article className="dashboard-stat">
                <span className="stat-icon total">T</span>
                <div><p>Total requests</p><strong>{supportRequests.length}</strong><small>All submitted requests</small></div>
              </article>
              <article className="dashboard-stat">
                <span className="stat-icon open">O</span>
                <div><p>Open</p><strong>{openCount}</strong><small>Awaiting review</small></div>
              </article>
              <article className="dashboard-stat">
                <span className="stat-icon progress">P</span>
                <div><p>In progress</p><strong>{inProgressCount}</strong><small>Being handled</small></div>
              </article>
              <article className="dashboard-stat">
                <span className="stat-icon resolved">R</span>
                <div><p>Resolved</p><strong>{resolvedCount}</strong><small>Completed requests</small></div>
              </article>
            </div>

            <section className="requests-section">
              <div className="section-heading requests-heading">
                <div>
                  <h3>Customer requests</h3>
                  <p>Review the details and update each request's status.</p>
                </div>
                <span className="request-count">{supportRequests.length} total</span>
              </div>

              {dashboardLoading && supportRequests.length === 0 ? (
                <div className="empty-state">Loading support requests...</div>
              ) : supportRequests.length === 0 ? (
                <div className="empty-state">
                  <strong>No support requests yet</strong>
                  <p>Submitted customer requests will appear here.</p>
                </div>
              ) : (
                <div className="requests-list">
                  {supportRequests.map((request) => (
                    <article className="request-card" key={request.request_id}>
                      <div className="request-card-header">
                        <div>
                          <span className="request-reference">REQUEST REFERENCE</span>
                          <h3>{request.request_id}</h3>
                          <p>{request.customer_email}</p>
                        </div>
                        <span className={`request-status status-${request.status.toLowerCase().replaceAll(' ', '-')}`}>
                          {request.status}
                        </span>
                      </div>

                      <div className="request-details-grid">
                        <div><span>Request type</span><strong>{request.request_type.replaceAll('_', ' ')}</strong></div>
                        <div><span>Order number</span><strong>{request.order_number || 'Not provided'}</strong></div>
                        <div><span>Submitted</span><strong>{request.created_at}</strong></div>
                      </div>
                      <div className="request-description">
                        <span>Description</span>
                        <p>{request.description}</p>
                      </div>
                      <div className="status-control">
                        <label htmlFor={`status-${request.request_id}`}>Update status</label>
                        <select
                          id={`status-${request.request_id}`}
                          value={request.status}
                          onChange={(event) => void updateRequestStatus(request.request_id, event.target.value)}
                          disabled={dashboardLoading}
                        >
                          {allowedStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

          </section>
        )}
      </section>
    </main>
  )
}

export default App
