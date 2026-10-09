import { createBrowserRouter, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import ProjectsPage from '../pages/ProjectsPage';
import EditorPage from '../pages/EditorPage';
export const router = createBrowserRouter([
  {path:'/', element:<HomePage/>},
  {path:'/login',element:<LoginPage/>},
  {path:'/projects',element:<ProjectsPage/>},
  {path:'/editor/:projectId',element:<EditorPage/>},
  {path:'*',element:<Navigate to="/" replace/>},
]);
