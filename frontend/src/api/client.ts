import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
});

export const uploadApi = axios.create({
  baseURL: '/api',
});

export const libraryApi = axios.create({
  baseURL: '/api/library',
});

export const libraryUploadApi = axios.create({
  baseURL: '/api/library',
});
