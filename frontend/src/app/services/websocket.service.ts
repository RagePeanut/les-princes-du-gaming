import { Injectable, signal, computed, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { ClientMessage, ServerMessage, SubmitTierVotePayload } from '@shared/ws-messages';
import { CLIENT_MSG } from '@shared/ws-messages';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private readonly messages$ = new Subject<ServerMessage>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 4;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string | null = null;

  readonly connectionState = signal<ConnectionState>('disconnected');
  readonly isConnected = computed(() => this.connectionState() === 'connected');
  readonly isReconnecting = computed(() => this.connectionState() === 'reconnecting');
  readonly showReconnectOverlay = this.isReconnecting;

  connect(url: string): void {
    this.url = url;
    this.reconnectAttempts = 0;
    this.openSocket(url);
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.url = null;
    this.reconnectAttempts = 0;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.connectionState.set('disconnected');
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  on<T>(type: string): Observable<T> {
    return this.messages$.pipe(
      filter((msg) => msg.type === type),
      map((msg) => msg.payload as T)
    );
  }

  submitTierVote(lobbyCode: string, roundIndex: number, tier: string, confirmed: boolean = false): void {
    this.send({
      type: CLIENT_MSG.SUBMIT_TIER_VOTE,
      payload: { lobbyCode, roundIndex, tier, confirmed } as SubmitTierVotePayload,
    });
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.messages$.complete();
  }

  private openSocket(url: string): void {
    this.connectionState.set(
      this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting'
    );

    try {
      this.socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.connectionState.set('connected');
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        this.messages$.next(message);
      } catch {
        // Ignore malformed messages
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (this.url) {
        this.scheduleReconnect();
      } else {
        this.connectionState.set('disconnected');
      }
    };

    this.socket.onerror = () => {
      // onclose will fire after onerror, reconnect handled there
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.url) {
      this.connectionState.set('disconnected');
      return;
    }

    this.connectionState.set('reconnecting');
    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // 1s, 2s, 4s, 8s
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (this.url) {
        this.openSocket(this.url);
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
