
"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, query, orderBy, getDocs, Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Utensils, ArrowLeft, ChefHat, CalendarDays, Info } from 'lucide-react';

interface LikedMeal {
  id: string;
  foodName: string;
  imageUrl: string;
  likedAt: FirestoreTimestamp; 
  // analysisDetails?: ScanFoodImageOutput; // Optional, if stored
}

export default function MyMealsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [likedMeals, setLikedMeals] = useState<LikedMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
        router.push('/login'); // Redirect if not logged in
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (currentUser) {
      const fetchLikedMeals = async () => {
        setIsLoading(true);
        try {
          const likedMealsRef = collection(db, `users/${currentUser.uid}/likedMeals`);
          const q = query(likedMealsRef, orderBy('likedAt', 'desc'));
          const querySnapshot = await getDocs(q);
          const mealsData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as LikedMeal[];
          setLikedMeals(mealsData);
        } catch (error) {
          console.error("Error fetching liked meals:", error);
          // Optionally show a toast message here
        } finally {
          setIsLoading(false);
        }
      };
      fetchLikedMeals();
    }
  }, [currentUser]);

  const formatDate = (timestamp: FirestoreTimestamp | Date | undefined) => {
    if (!timestamp) return 'ไม่ระบุวันที่';
    const date = timestamp instanceof FirestoreTimestamp ? timestamp.toDate() : timestamp;
    try {
      return format(date, "d MMMM yyyy, HH:mm น.", { locale: th });
    } catch (error) {
      console.error("Error formatting date:", error, timestamp);
      return 'วันที่ไม่ถูกต้อง';
    }
  };


  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 md:p-8">
      <header className="py-6 mb-8">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="inline-block">
            <Button variant="outline" size="lg">
              <ArrowLeft className="mr-2 h-5 w-5" />
              กลับหน้าหลัก
            </Button>
          </Link>
          <h1 className="text-3xl md:text-4xl font-headline font-bold text-primary flex items-center">
            <ChefHat className="w-8 h-8 md:w-10 md:h-10 mr-2 md:mr-3" />
            มื้ออาหารของฉัน
          </h1>
          <div className="w-24"> {/* Spacer to balance the back button */}</div>
        </div>
      </header>

      <main className="container mx-auto px-4">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, index) => (
              <Card key={index} className="shadow-lg rounded-lg overflow-hidden">
                <CardHeader>
                  <Skeleton className="h-48 w-full rounded-t-lg" />
                </CardHeader>
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-6 w-3/4 rounded" />
                  <Skeleton className="h-4 w-1/2 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : likedMeals.length === 0 ? (
          <Card className="max-w-md mx-auto shadow-lg rounded-lg p-8 text-center bg-card">
             <Info className="w-16 h-16 text-primary mx-auto mb-4" />
            <CardTitle className="text-2xl font-headline text-primary mb-2">ยังไม่มีมื้ออาหารที่ถูกใจ</CardTitle>
            <CardDescription className="text-md font-body text-muted-foreground">
              เมื่อคุณกดถูกใจมื้ออาหารที่สแกนแล้ว รายการจะแสดงที่นี่ค่ะ
            </CardDescription>
            <Button asChild className="mt-6">
                <Link href="/">
                    <Utensils className="mr-2 h-5 w-5" /> ไปสแกนอาหารเลย
                </Link>
            </Button>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-200px)]"> {/* Adjust height as needed */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-1">
              {likedMeals.map((meal) => (
                <Card key={meal.id} className="shadow-xl rounded-xl overflow-hidden flex flex-col bg-card hover:shadow-2xl transition-shadow duration-300">
                  <CardHeader className="p-0 relative">
                    {meal.imageUrl ? (
                       <Image
                        src={meal.imageUrl}
                        alt={meal.foodName}
                        width={400}
                        height={300}
                        className="object-cover w-full h-48 md:h-56 rounded-t-xl"
                        data-ai-hint="food meal"
                      />
                    ) : (
                      <div className="w-full h-48 md:h-56 rounded-t-xl bg-muted flex items-center justify-center">
                        <Utensils className="w-16 h-16 text-muted-foreground" />
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 flex-grow flex flex-col justify-between">
                    <div>
                      <CardTitle className="text-xl font-headline text-primary mb-1 truncate" title={meal.foodName}>
                        {meal.foodName}
                      </CardTitle>
                       <CardDescription className="text-xs text-muted-foreground flex items-center">
                        <CalendarDays className="w-3 h-3 mr-1.5" />
                        ถูกใจเมื่อ: {formatDate(meal.likedAt)}
                      </CardDescription>
                    </div>
                    {/* Future: Add unlike button or more actions here */}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </main>
      <footer className="text-center py-8 mt-8 border-t border-border/50">
        <p className="text-muted-foreground font-body">&copy; {new Date().getFullYear()} FSFA (Food Security For All) สงวนลิขสิทธิ์</p>
      </footer>
    </div>
  );
}

