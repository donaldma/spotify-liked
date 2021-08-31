import { parse } from 'query-string'

const key = 'access_token'

export const getAuth = () => {
    return localStorage.getItem(key)
}

export const setAuth = () => {
    const parsedHash = parse(location.hash)
    const token = parsedHash['access_token']

    if (token) {
        localStorage.setItem(key, token)
        location.href = '/'
    }
}

export const clearAuth = (redirect = '/') => {
    localStorage.removeItem(key)

    if (redirect) {
        location.href = redirect
    }
}
