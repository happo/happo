import { createInterface } from 'node:readline';

export default function promptUser(message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(message, (answer) => {
      rl.close();
      // Only proceed if Enter was pressed (empty string or newline)
      if (answer.trim() === '') {
        resolve();
      } else {
        reject(new Error('User cancelled authentication'));
      }
    });
  });
}
