export default {
    data() {
        return {
            key: 'access_token',
        }
    },

    methods: {
        getAuth() {
            return localStorage.getItem(this.key)
        },
        setAuth(token) {
            localStorage.setItem(this.key, token)
            location.href = '/'
        },
        clearAuth(redirect = '/') {
            localStorage.removeItem(this.key)

            if(redirect) {
                location.href = redirect
            }
        },
    },
}
