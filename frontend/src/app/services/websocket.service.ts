import { Injectable } from '@angular/core'
import { Subject, Observable } from 'rxjs'
import { webSocket, WebSocketSubject } from 'rxjs/webSocket'
import { WebSocketMessage } from '../models/run.model'
import { environment } from '../../environments/environment'

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private connections: Map<string, WebSocketSubject<WebSocketMessage>> = new Map()

  connect(sessionId: string): Observable<WebSocketMessage> {
    if (this.connections.has(sessionId)) {
      return this.connections.get(sessionId)!.asObservable()
    }

    const wsUrl = `${environment.wsUrl}/ws/interactive/${sessionId}`
    const socket$ = webSocket<WebSocketMessage>({
      url: wsUrl,
      openObserver: {
        next: () => {
          console.log(`WebSocket connected for session ${sessionId}`)
        }
      },
      closeObserver: {
        next: (event) => {
          console.log(`WebSocket closed for session ${sessionId}:`, event)
          this.connections.delete(sessionId)
        }
      }
    })
    
    this.connections.set(sessionId, socket$)
    
    return socket$.asObservable()
  }

  disconnect(sessionId: string): void {
    const socket = this.connections.get(sessionId)
    if (socket) {
      socket.complete()
      this.connections.delete(sessionId)
    }
  }

  sendMessage(sessionId: string, message: WebSocketMessage): void {
    const socket = this.connections.get(sessionId)
    if (socket && !socket.closed) {
      socket.next(message)
    }
  }

  sendInput(sessionId: string, input: string): void {
    this.sendMessage(sessionId, {
      type: 'stdin',
      data: input,
      timestamp: new Date().toISOString()
    })
  }

  isConnected(sessionId: string): boolean {
    const socket = this.connections.get(sessionId)
    return socket ? !socket.closed : false
  }

  disconnectAll(): void {
    this.connections.forEach((socket) => {
      socket.complete()
    })
    this.connections.clear()
  }
}
