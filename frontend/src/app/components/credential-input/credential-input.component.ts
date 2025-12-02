import { Component, Input, Output, EventEmitter } from '@angular/core'

@Component({
  selector: 'app-credential-input',
  standalone: true,
  imports: [],
  templateUrl: './credential-input.component.html',
  styleUrl: './credential-input.component.scss'
})
export class CredentialInputComponent {
  @Input() label: string = 'Credentials'
  @Input() username: string | null | undefined = ''
  @Input() password: string | null | undefined = ''
  @Input() helpText: string = ''
  @Input() usernamePlaceholder: string = 'Username'
  @Input() passwordPlaceholder: string = 'Password'

  @Output() usernameChange = new EventEmitter<string>()
  @Output() passwordChange = new EventEmitter<string>()

  onUsernameChange(value: string): void {
    this.username = value
    this.usernameChange.emit(value)
  }

  onPasswordChange(value: string): void {
    this.password = value
    this.passwordChange.emit(value)
  }

  get usernameValue(): string {
    return this.username ?? ''
  }

  get passwordValue(): string {
    return this.password ?? ''
  }
}
