import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export class ProcessManager {
    static async isAntigravityRunning(): Promise<boolean> {
        try {
            const platform = os.platform();
            if (platform === 'win32') {
                const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq antigravity.exe" /NH');
                return stdout.toLowerCase().includes('antigravity.exe');
            } else {
                // macOS and Linux
                const { stdout } = await execAsync('ps -A -o comm=');
                return stdout.toLowerCase().includes('antigravity');
            }
        } catch (e) {
            return false;
        }
    }

    static async closeAntigravity(): Promise<boolean> {
        if (!(await this.isAntigravityRunning())) {
            return true;
        }

        try {
            console.log('Sending kill signal...');
            const platform = os.platform();
            if (platform === 'win32') {
                await execAsync('taskkill /F /IM antigravity.exe');
            } else {
                // macOS and Linux
                await execAsync('pkill -f antigravity || killall antigravity || true');
            }
            
            // Wait for process to disappear
            for (let i = 0; i < 20; i++) { // Max 10 seconds
                await new Promise(resolve => setTimeout(resolve, 500));
                if (!(await this.isAntigravityRunning())) {
                    console.log('Antigravity process gone.');
                    return true;
                }
            }
            
            console.error('Antigravity process still exists after timeout.');
            return false;
        } catch (e) {
            console.error('Failed to close Antigravity', e);
            return false;
        }
    }

    static async startAntigravity() {
        try {
            console.log('Starting Antigravity...');
            const platform = os.platform();
            if (platform === 'win32') {
                // Use PowerShell Start-Process for reliable detached execution
                const child = spawn('powershell', ['-Command', "Start-Process 'antigravity://'"], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true
                });
                child.unref();
            } else if (platform === 'darwin') {
                // macOS
                const child = spawn('open', ['antigravity://'], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
            } else {
                // Linux
                const child = spawn('xdg-open', ['antigravity://'], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
            }
        } catch (e) {
            console.error('Failed to start Antigravity', e);
        }
    }
}
