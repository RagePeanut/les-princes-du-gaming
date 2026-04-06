import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { WebSocketService } from './websocket.service';
import { SERVER_MSG, type AvatarAssignedPayload } from '@shared/ws-messages';

@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly ws = inject(WebSocketService);
  private readonly cache = signal<Map<string, string>>(new Map());
  private subscription: Subscription | null = null;

  init(): void {
    this.subscription = this.ws
      .on<AvatarAssignedPayload>(SERVER_MSG.AVATAR_ASSIGNED)
      .subscribe((payload) => {
        this.cache.update((current) => {
          const updated = new Map(current);
          updated.set(payload.playerId, payload.avatarDataUri);
          return updated;
        });
      });
  }

  getAvatar(playerId: string): string | undefined {
    return this.cache().get(playerId);
  }

  destroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.cache.set(new Map());
  }
}
