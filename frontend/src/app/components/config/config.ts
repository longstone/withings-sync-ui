import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService, AppSettings } from '../../services/settings.service';

@Component({
  selector: 'app-config',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="config-container">
      @if (showToast) {
        <div class="toast" [class.success]="toastType === 'success'" [class.info]="toastType === 'info'">
          {{ toastMessage }}
        </div>
      }
      <h2>Configuration</h2>
      <div class="config-section">
        <h3>General Settings</h3>
        <div class="config-item">
          <label for="logLevel">Log Level</label>
          <select id="logLevel" [(ngModel)]="settings.logLevel">
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>
      <div class="config-section">
        <h3>Date & Time Settings</h3>
        <div class="config-item">
          <label for="timeFormat">Time Format</label>
          <select id="timeFormat" [(ngModel)]="settings.timeFormat">
            <option value="12h">12-hour (AM/PM)</option>
            <option value="24h">24-hour</option>
          </select>
        </div>
        <div class="config-item">
          <label for="dateFormat">Date Format</label>
          <select id="dateFormat" [(ngModel)]="settings.dateFormat">
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="DD.MM.YYYY">DD.MM.YYYY</option>
          </select>
        </div>
      </div>
      <div class="config-section">
        <h3>API Settings</h3>
        <div class="config-item">
          <label for="apiTimeout">API Timeout (seconds)</label>
          <input type="number" id="apiTimeout" [(ngModel)]="settings.apiTimeout" min="1" max="300">
        </div>
      </div>
      <div class="config-actions">
        <button class="btn-primary" (click)="saveSettings()">Save Settings</button>
        <button class="btn-secondary" (click)="resetSettings()">Reset to Defaults</button>
      </div>
    </div>
  `,
  styles: `
    .config-container {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-weight: 500;
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
    }
    .toast.success {
      background: #28a745;
    }
    .toast.info {
      background: #17a2b8;
    }
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    .config-section {
      background: #f5f5f5;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 8px;
    }
    .config-item {
      margin-bottom: 15px;
    }
    .config-item label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    .config-item select,
    .config-item input {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .config-actions {
      display: flex;
      gap: 10px;
    }
    .btn-primary {
      background: #007bff;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-secondary {
      background: #6c757d;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
    }
  `,
})
export class Config implements OnInit {
  settings: AppSettings;
  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'info' = 'success';

  constructor(private settingsService: SettingsService) {
    this.settings = { ...this.settingsService.settings };
  }

  ngOnInit() {
    // Load settings from service
    this.loadSettings();
  }

  loadSettings() {
    this.settings = { ...this.settingsService.settings };
  }

  saveSettings() {
    this.settingsService.updateSettings(this.settings);
    this.showToastMessage('Settings saved successfully!', 'success');
  }

  resetSettings() {
    this.settingsService.resetSettings();
    this.settings = { ...this.settingsService.settings };
    this.showToastMessage('Settings reset to defaults', 'info');
  }

  private showToastMessage(message: string, type: 'success' | 'info') {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    
    // Hide toast after 3 seconds
    setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }
}
