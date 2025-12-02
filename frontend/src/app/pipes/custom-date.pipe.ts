import { Pipe, PipeTransform } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SettingsService } from '../services/settings.service';

@Pipe({
  name: 'customDate',
  pure: false,
  standalone: true
})
export class CustomDatePipe implements PipeTransform {
  private datePipe: DatePipe;
  private lastValue: string | null = null;
  private lastInput: any;
  private lastSettings: string = '';

  constructor(private settingsService: SettingsService) {
    this.datePipe = new DatePipe('en-US');
  }

  transform(value: Date | string | number, format?: string): string | null {
    // Check if input has changed to avoid unnecessary re-formatting
    const currentSettings = JSON.stringify(this.settingsService.settings);
    if (value === this.lastInput && currentSettings === this.lastSettings && this.lastValue !== null) {
      return this.lastValue;
    }

    this.lastInput = value;
    this.lastSettings = currentSettings;
    
    if (!value) {
      this.lastValue = null;
      return null;
    }

    const settings = this.settingsService.settings;
    
    // If custom format is provided, use it
    if (format) {
      this.lastValue = this.datePipe.transform(value, format);
      return this.lastValue;
    }

    // Build format based on settings
    const dateFormat = settings.dateFormat;
    const timeFormat = settings.timeFormat;
    
    // Map our custom formats to Angular DatePipe formats
    let angularDateFormat: string;
    switch (dateFormat) {
      case 'DD/MM/YYYY':
        angularDateFormat = 'dd/MM/yyyy';
        break;
      case 'MM/DD/YYYY':
        angularDateFormat = 'MM/dd/yyyy';
        break;
      case 'YYYY-MM-DD':
        angularDateFormat = 'yyyy-MM-dd';
        break;
      case 'DD.MM.YYYY':
        angularDateFormat = 'dd.MM.yyyy';
        break;
      default:
        angularDateFormat = 'dd/MM/yyyy';
    }

    // Add time format
    if (timeFormat === '12h') {
      angularDateFormat += ' h:mm a';
    } else {
      angularDateFormat += ' HH:mm';
    }

    this.lastValue = this.datePipe.transform(value, angularDateFormat);
    return this.lastValue;
  }
}
