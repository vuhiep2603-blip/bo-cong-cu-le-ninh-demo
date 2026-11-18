import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthGate} from './auth-gate';
import './style.css';

document.title = 'Nghiệm thu Google Sign-In | Lệ Ninh';
createRoot(document.getElementById('root')!).render(<StrictMode><AuthGate/></StrictMode>);
