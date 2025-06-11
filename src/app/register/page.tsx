"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Utensils } from 'lucide-react';


export default function RegisterPage() {

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
          {/* Registration form content removed */}
          <p className="text-center text-muted-foreground">Registration functionality has been removed from this page.</p>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <p className="text-sm text-muted-foreground">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              เข้าสู่ระบบที่นี่
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
