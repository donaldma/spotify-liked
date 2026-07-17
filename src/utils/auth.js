const clientId = import.meta.env.VITE_CLIENT_ID
const redirectUri = import.meta.env.VITE_REDIRECT_URI

const tokenKey = 'access_token'
const refreshKey = 'refresh_token'
const expiresKey = 'expires_at'
const scopeKey = 'granted_scope'
const verifierKey = 'code_verifier'
const stateKey = 'auth_state'

const scopes = [
    'user-library-read',
    'playlist-modify-public',
    'playlist-modify-private',
    'playlist-read-collaborative',
]

const base64url = (bytes) => {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

const storeTokens = (body) => {
    localStorage.setItem(tokenKey, body.access_token)
    localStorage.setItem(expiresKey, String(Date.now() + body.expires_in * 1000))

    if (body.refresh_token) {
        localStorage.setItem(refreshKey, body.refresh_token)
    }
    if (body.scope) {
        localStorage.setItem(scopeKey, body.scope)
    }
}

const requestTokens = async (params) => {
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, ...params }),
    })
    return response.json()
}

export const getAuth = () => {
    return localStorage.getItem(tokenKey)
}

// logs out if a previous login is missing scopes the app now needs
export const checkScopes = () => {
    if (!getAuth()) {
        return
    }

    const granted = (localStorage.getItem(scopeKey) || '').split(' ')
    if (!scopes.every((scope) => granted.includes(scope))) {
        clearAuth(null)
    }
}

export const beginAuth = async () => {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)))
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)))
    localStorage.setItem(verifierKey, verifier)
    localStorage.setItem(stateKey, state)

    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(verifier)
    )

    const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge_method: 'S256',
        code_challenge: base64url(new Uint8Array(digest)),
        scope: scopes.join(' '),
        state,
    })

    location.href = `https://accounts.spotify.com/authorize?${query}`
}

export const setAuth = async () => {
    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    const verifier = localStorage.getItem(verifierKey)
    const expectedState = localStorage.getItem(stateKey)

    if (!code || !verifier) {
        return
    }

    localStorage.removeItem(verifierKey)
    localStorage.removeItem(stateKey)

    if (params.get('state') !== expectedState) {
        console.error('Spotify auth state mismatch, ignoring callback')
        return
    }

    const body = await requestTokens({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
    })

    if (body.access_token) {
        storeTokens(body)
        location.href = '/'
    } else {
        console.error('Spotify token exchange failed', body)
    }
}

// returns a valid access token, refreshing it first if (nearly) expired
export const ensureAuth = async () => {
    const token = getAuth()
    const refreshToken = localStorage.getItem(refreshKey)
    const expiresAt = Number(localStorage.getItem(expiresKey) || 0)

    if (!token) {
        return null
    }

    if (Date.now() < expiresAt - 60 * 1000) {
        return token
    }

    if (!refreshToken) {
        clearAuth(null)
        return null
    }

    const body = await requestTokens({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    })

    if (!body.access_token) {
        console.error('Spotify token refresh failed', body)
        clearAuth(null)
        return null
    }

    storeTokens(body)
    return body.access_token
}

export const clearAuth = (redirect = '/') => {
    localStorage.removeItem(tokenKey)
    localStorage.removeItem(refreshKey)
    localStorage.removeItem(expiresKey)
    localStorage.removeItem(scopeKey)

    if (redirect) {
        location.href = redirect
    }
}
