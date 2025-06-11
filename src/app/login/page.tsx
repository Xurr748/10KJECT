
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, Utensils } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    // Placeholder for actual login logic
    console.log('Login attempt with:', { email, password });
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    toast({
      title: "เข้าสู่ระบบ (ตัวอย่าง)",
      description: "การยืนยันตัวตนจริงยังไม่ได้ถูกนำมาใช้",
    });
    setIsLoading(false);
    // router.push('/'); // Redirect after successful login
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-body">
      <Link href="/" className="mb-8">
        <div className="flex items-center text-primary hover:text-primary/80 transition-colors">
          <Utensils className="w-10 h-10 mr-3" />
          <span className="text-3xl font-headline font-bold">FSFA</span>
        </div>
      </Link>
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">เข้าสู่ระบบ</CardTitle>
          <CardDescription>ยินดีต้อนรับกลับ! กรอกข้อมูลเพื่อเข้าสู่ระบบ</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">อีเมล</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="text-lg p-3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="text-lg p-3"
              />
            </div>
            <Button type="submit" className="w-full text-lg py-6" size="lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" /> เข้าสู่ระบบ
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <p className="text-sm text-muted-foreground">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              ลงทะเบียนที่นี่
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
    