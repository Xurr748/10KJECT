// src/app/datastore-summary/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFirestore } from '@/firebase';
import { collection, getDocs, QueryDocumentSnapshot, DocumentData, Timestamp } from 'firebase/firestore';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Database, FileText, Utensils, HelpCircle } from 'lucide-react';

// Define types based on docs/backend.json
interface Article {
  id: string;
  title: string;
  content: string;
  publicationDate: Timestamp | { seconds: number, nanoseconds: number };
}

interface FoodItem {
  id: string;
  name: string;
  nutritionalInformation: string;
  safetyAdvice: string;
  imageUrl: string;
}

interface QuestionAnswer {
  id:string;
  question: string;
  answer: string;
  timestamp: Timestamp | { seconds: number, nanoseconds: number };
}

function formatTimestamp(ts: Timestamp | { seconds: number, nanoseconds: number } | undefined): string {
    if (!ts) return 'N/A';
    const date = (ts instanceof Timestamp) ? ts.toDate() : new Timestamp(ts.seconds, ts.nanoseconds).toDate();
    return date.toLocaleString('th-TH');
}


export default function DatastoreSummaryPage() {
  const db = useFirestore();
  const [articles, setArticles] = useState<Article[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!db) return;
      setIsLoading(true);
      try {
        const collections = {
          articles: collection(db, 'articles'),
          food_items: collection(db, 'food_items'),
          question_answers: collection(db, 'question_answers'),
        };

        const [articlesSnapshot, foodItemsSnapshot, qaSnapshot] = await Promise.all([
          getDocs(collections.articles),
          getDocs(collections.food_items),
          getDocs(collections.question_answers),
        ]);

        const mapDoc = <T,>(doc: QueryDocumentSnapshot<DocumentData>): T => ({ id: doc.id, ...doc.data() } as T);

        setArticles(articlesSnapshot.docs.map(mapDoc<Article>));
        setFoodItems(foodItemsSnapshot.docs.map(mapDoc<FoodItem>));
        setQuestionAnswers(qaSnapshot.docs.map(mapDoc<QuestionAnswer>));

      } catch (error) {
        console.error("Error fetching datastore summary:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [db]);

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 sm:p-6 md:p-8">
      <header className="mb-8">
        <div className="container mx-auto flex items-center justify-between">
          <h1 className="text-3xl sm:text-4xl font-headline font-bold text-primary flex items-center">
            <Database className="w-8 h-8 mr-3" />
            สรุปฐานข้อมูล
          </h1>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              กลับหน้าหลัก
            </Link>
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      ) : (
        <main className="container mx-auto grid grid-cols-1 gap-8">
          {/* Articles Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                    <FileText className="w-6 h-6 mr-3 text-primary"/>
                    บทความ (Articles)
                </div>
                <Badge variant="secondary">{articles.length} รายการ</Badge>
              </CardTitle>
              <CardDescription>
                ข้อมูลบทความเกี่ยวกับโภชนาการและความปลอดภัยของอาหารสำหรับผู้สูงอายุ
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[25%]">หัวข้อ</TableHead>
                      <TableHead>เนื้อหา (ตัวอย่าง)</TableHead>
                      <TableHead className="w-[20%] text-right">วันที่เผยแพร่</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articles.length > 0 ? (
                      articles.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.title}</TableCell>
                          <TableCell>{item.content.substring(0, 100)}...</TableCell>
                          <TableCell className="text-right">{formatTimestamp(item.publicationDate)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          ไม่มีข้อมูลบทความ
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Food Items Card */}
          <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center">
                        <Utensils className="w-6 h-6 mr-3 text-primary"/>
                        รายการอาหาร (Food Items)
                    </div>
                    <Badge variant="secondary">{foodItems.length} รายการ</Badge>
                </CardTitle>
              <CardDescription>
                ข้อมูลรายการอาหารที่ระบุโดย AI Image Scanner
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[20%]">ชื่ออาหาร</TableHead>
                      <TableHead>ข้อมูลโภชนาการ</TableHead>
                      <TableHead>คำแนะนำ</TableHead>
                       <TableHead className="w-[10%]">รูปภาพ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {foodItems.length > 0 ? (
                      foodItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.nutritionalInformation}</TableCell>
                          <TableCell>{item.safetyAdvice}</TableCell>
                          <TableCell>
                            <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              ดูรูป
                            </a>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          ไม่มีข้อมูลรายการอาหาร
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Q&A Card */}
          <Card>
            <CardHeader>
               <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center">
                        <HelpCircle className="w-6 h-6 mr-3 text-primary"/>
                        ถาม-ตอบ (Q&A)
                    </div>
                    <Badge variant="secondary">{questionAnswers.length} รายการ</Badge>
                </CardTitle>
              <CardDescription>
                ประวัติการถาม-ตอบระหว่างผู้ใช้และ AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">คำถาม</TableHead>
                      <TableHead className="w-[40%]">คำตอบ</TableHead>
                      <TableHead className="w-[20%] text-right">เวลา</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questionAnswers.length > 0 ? (
                      questionAnswers.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.question}</TableCell>
                          <TableCell>{item.answer}</TableCell>
                          <TableCell className="text-right">{formatTimestamp(item.timestamp)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          ไม่มีข้อมูลการถาม-ตอบ
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

        </main>
      )}
    </div>
  );
}
