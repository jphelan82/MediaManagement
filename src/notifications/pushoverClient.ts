import axios from 'axios';
import { appConfig } from '../config';
import logger from '../logger';

export class PushoverClient {
  private readonly apiUrl = 'https://api.pushover.net/1/messages.json';

  async send(title: string, message: string, url?: string): Promise<void> {
    if (!appConfig.pushover.enabled) {
      logger.debug('Pushover disabled, skipping notification');
      return;
    }

    try {
      await axios.post(this.apiUrl, {
        token: appConfig.pushover.apiToken,
        user: appConfig.pushover.userKey,
        title,
        message,
        url,
        html: 1,
      });
      logger.info(`Pushover notification sent: ${title}`);
    } catch (err) {
      logger.error('Failed to send Pushover notification', { error: err });
    }
  }
}
