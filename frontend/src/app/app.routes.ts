import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/hub/hub.component').then((m) => m.HubComponent),
  },
  {
    path: 'game/ranking/:code',
    loadComponent: () =>
      import('./pages/game/game.component').then((m) => m.GameComponent),
  },
  {
    path: 'game/tierlist/:code',
    loadComponent: () =>
      import('./pages/tierlist-game/tierlist-game.component').then(
        (m) => m.TierlistGameComponent
      ),
  },
];
