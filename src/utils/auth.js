const key = 'access_token'
const verifierKey = 'code_verifier'

const base64url = (bytes) => {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

export const getAuth = () => {
    return localStorage.getItem(key)
}

export const beginAuth = async ({ clientId, redirectUri, scope, state }) => {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)))
    localStorage.setItem(verifierKey, verifier)

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
        scope: scope.join(' '),
        show_dialog: true,
        state,
    })

    location.href = `https://accounts.spotify.com/authorize?${query}`
}

export const setAuth = async ({ clientId, redirectUri }) => {
    const code = new URLSearchParams(location.search).get('code')
    const verifier = localStorage.getItem(verifierKey)

    if (!code || !verifier) {
        return
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: verifier,
        }),
    })
    const body = await response.json()

    localStorage.removeItem(verifierKey)

    if (body.access_token) {
        localStorage.setItem(key, body.access_token)
        location.href = '/'
    } else {
        console.error('Spotify token exchange failed', body)
    }
}

export const clearAuth = (redirect = '/') => {
    localStorage.removeItem(key)

    if (redirect) {
        location.href = redirect
    }
}
