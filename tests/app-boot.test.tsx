// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/App';
import { db } from '../src/db';

/**
 * اختبار إقلاع: يضمن أن التطبيق يُقلع فعليًا ويرسم واجهته بدل صفحة بيضاء.
 * يفشل عند أي انهيار وقت التشغيل، ويحمي من تكرار مشكلة مسارات الأصول الخاطئة.
 */
describe('إقلاع التطبيق', () => {
  beforeEach(async () => {
    cleanup();
    await db.delete();
    await db.open();
  });

  it('يرسم شاشة الإنشاء الأولى عند عدم وجود عائلة', async () => {
    render(<App />);

    expect(await screen.findByText('أنشئ شجرة عائلتك')).toBeTruthy();
    expect(screen.getByText('ابدأ من شخص تعرفه، ودع الشجرة تكبر معك.')).toBeTruthy();
  });

  it('يعرض العائلة المحفوظة مع أفرادها بعد إعادة التشغيل', async () => {
    await db.families.add({ id: 'fam', name: 'آل سالم', rootPersonId: 'p1', createdAt: 1, updatedAt: 1 });
    await db.people.add({ id: 'p1', familyId: 'fam', firstName: 'أحمد', gender: 'male', createdAt: 1, updatedAt: 1 });

    render(<App />);

    // اسم العائلة يظهر في الشريط العلوي وفي الصفحة الرئيسية
    await waitFor(() => expect(screen.getAllByText('آل سالم').length).toBeGreaterThan(1));
    expect(await screen.findByText('استكشف الشجرة')).toBeTruthy();
    expect(screen.getAllByText('أحمد').length).toBeGreaterThan(0);
  });

  // يُتحقق من ناتج البناء الفعلي متى كان مجلد dist موجودًا (يُتخطى قبل أول build)
  it('تسجيل الـService Worker يستخدم مسارًا مطابقًا للمسار الأساسي للنشر', () => {
    const file = new URL('../dist/registerSW.js', import.meta.url);
    if (!existsSync(file)) return;

    const registered = readFileSync(file, 'utf8').match(/register\('([^']+)'/)?.[1];
    expect(registered).toBeTruthy();
    expect(registered!.startsWith('/')).toBe(true);
    expect(registered!.endsWith('/sw.js')).toBe(true);
    expect(registered!.endsWith('family-tree/sw.js')).toBe(false); // مسار جذر النطاق افتراضيًا
  });
});
