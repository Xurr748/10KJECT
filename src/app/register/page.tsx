
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Utensils, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase'; // Import Firebase auth
import { createUserWithEmailAndPassword } from 'firebase/auth';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    if (password !== confirmPassword) {
      toast({
        title: "ลงทะเบียนไม่สำเร็จ",
        description: "รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      toast({
        title: "ลงทะเบียนไม่สำเร็จ",
        description: "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      toast({
        title: "ลงทะเบียนสำเร็จ",
        description: "บัญชีของคุณถูกสร้างเรียบร้อยแล้ว",
      });
      router.push('/'); // Redirect after successful registration
    } catch (error: any) {
      console.error('Registration error:', error); // This log is expected in the console during development
      let errorMessage = "เกิดข้อผิดพลาดในการลงทะเบียน";
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "อีเมลนี้ถูกใช้งานแล้ว";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "รูปแบบอีเมลไม่ถูกต้อง";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "รหัสผ่านไม่คาดเดาได้ง่าย โปรดใช้รหัสผ่านที่ซับซ้อนกว่านี้";
      }
      toast({
        title: "ลงทะเบียนไม่สำเร็จ",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
          <CardTitle className="text-3xl font-headline text-primary">สร้างบัญชีใหม่</CardTitle>
          <CardDescription>กรอกข้อมูลเพื่อลงทะเบียนใช้งาน</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-6">
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
              <Label htmlFor="password">รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</Label>
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                  กำลังลงทะเบียน...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-5 w-5" /> สร้างบัญชี
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <p className="text-sm text-muted-foreground">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline flex items-center">
               <LogIn className="mr-1 h-4 w-4" /> เข้าสู่ระบบที่นี่
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
