import { Routes } from '@angular/router';

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
];


