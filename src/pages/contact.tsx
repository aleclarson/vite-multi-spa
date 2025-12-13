import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

function Contact() {
  return (
    <>
      <h1>Contact Us</h1>
      <form>
        <input type="text" placeholder="Name" />
        <input type="email" placeholder="Email" />
        <input type="text" placeholder="Message" />
        <button type="submit">Submit</button>
      </form>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          window.location.href = '/'
        }}
      >
        Return home
      </button>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Contact />
  </StrictMode>,
)
