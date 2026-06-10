import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent),
  },
  {
    path: 'game/:slug',
    loadComponent: () => import('./features/accounts/account-list/account-list.component').then((m) => m.AccountListComponent),
  },
  {
    path: 'account/:id',
    loadComponent: () => import('./features/accounts/account-detail/account-detail.component').then((m) => m.AccountDetailComponent),
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
    canActivate: [adminGuard]
  },
  {
    path: 'error',
    loadComponent: () => import('./features/error/error.component').then((m) => m.ErrorComponent),
  }
];


