import axios from "axios";

// Khi đóng gói Electron (file://) không có Vite proxy → dùng URL trực tiếp
const isElectron = window.location.protocol === 'file:';

const apiClient = axios.create({
    baseURL: isElectron ? 'https://kyta.fpt.com/eioc' : '/api-eioc',
    headers: { 'Content-Type': 'application/json' }
});

const LOGIN_URL = isElectron ? 'https://eaccount.kyta.fpt.com/auth/login' : '/api-auth/auth/login';

const ADMIN_ACCOUNT = {
    username: "kyta.fpt.ioc@gmail.com",
    password: "admin@123"
};

let currentAccessToken = localStorage.getItem('access_token') || null;
let isRefreshing = false;

export const getAccessToken = () => currentAccessToken;

apiClient.interceptors.request.use(config => {
    if (currentAccessToken){
        config.headers['Authorization'] = `Bearer ${currentAccessToken}`;
    }
    return config;
});

apiClient.interceptors.response.use(
    res => res,
    async error => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    setTimeout(() => resolve(apiClient(originalRequest)), 500);
                });
            }
            originalRequest._retry = true;
            isRefreshing = true;
            try {
                await autoLogin();
                originalRequest.headers['Authorization'] = `Bearer ${currentAccessToken}`;
                return apiClient(originalRequest);
            } catch (loginError) {
                return Promise.reject(loginError);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error);
    }
);

async function autoLogin() {
    try {
        const response = await axios.post(LOGIN_URL, ADMIN_ACCOUNT);
        currentAccessToken = response.data.access_token;
        localStorage.setItem('access_token', currentAccessToken);
        console.log(" Đã lấy Access Token mới thành công.");
    } catch (error) {
        console.error(" Lỗi Auto Login:", error);
        currentAccessToken = null;
        localStorage.removeItem('access_token');
    }
}

if (!currentAccessToken) {
    autoLogin();
}

export default apiClient;