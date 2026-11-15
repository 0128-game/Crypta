// atk-progress.js  裏面（Eve・Mallory）の進み具合
import { isDev } from './progress.js';
export const ATK_KEY = 'crypta:atk:done';
export const doneList = () => { try { return JSON.parse(localStorage.getItem(ATK_KEY) ?? '[]'); } catch { return []; } };
export const markDone = (id) => { try { localStorage.setItem(ATK_KEY, JSON.stringify([...new Set([...doneList(), id])])); } catch { /* 保存できなくても続ける */ } };
export const resetAtk = () => { try { localStorage.removeItem(ATK_KEY); } catch { /* 何もしない */ } };
// 表面と同じ：前のステージをクリアすると、次が遊べる（開発中は ?dev=1 で全部）
export const isOpen = (stages, i, done = doneList()) => isDev() || i === 0 || done.includes(stages[i - 1].id);
