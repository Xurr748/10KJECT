
"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { analyzeFoodImage, type AnalyzeFoodImageInput, type AnalyzeFoodImageOutput } from '@/ai/flows/food-image-analyzer';
import { askQuestion, type AskQuestionInput, type AskQuestionOutput } from '@/ai/flows/interactive-q-and-a';
import { auth, db } from '@/lib/firebase'; // Import db from Firebase
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  serverTimestamp,
  where,
  getDocs,
  writeBatch
} from 'firebase/firestore'; // Import Firestore functions

// ShadCN UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"


// Lucide Icons
import { UploadCloud, Bot, Brain, Utensils, AlertCircle, CheckCircle, Info, Lightbulb, MessagesSquare, UserCircle, LogIn, UserPlus, LogOut, Trash2 } from 'lucide-react';

// Chat Message Type
interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export default function FSFAPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<AnalyzeFoodImageOutput | null>(null);
  const [isLoadingImageAnalysis, setIsLoadingImageAnalysis] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [showQaSection, setShowQaSection] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoadingQa, setIsLoadingQa] = useState(false);
  const [isChatHistoryLoading, setIsChatHistoryLoading] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        // setChatMessages([]); // Let the chat history loading handle this
      } else {
        setChatMessages([]);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setIsChatHistoryLoading(true);
      const messagesRef = collection(db, 'userChats', currentUser.uid, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));

      const unsubscribeFirestore = onSnapshot(q, (querySnapshot) => {
        const history: ChatMessage[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          history.push({
            id: doc.id,
            sender: data.sender,
            text: data.text,
            timestamp: (data.timestamp as Timestamp)?.toDate() || new Date() 
          });
        });
        setChatMessages(history);
        setIsChatHistoryLoading(false);
      }, (error) => {
        console.error("Error loading chat history:", error);
        toast({
          title: "ข้อผิดพลาด",
          description: "ไม่สามารถโหลดประวัติการแชทได้",
          variant: "destructive",
        });
        setIsChatHistoryLoading(false);
      });

      return () => unsubscribeFirestore();
    } else {
      setChatMessages([]); 
    }
  }, [currentUser, toast]);


  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "ออกจากระบบสำเร็จ",
      });
      // router.push('/login'); // Optional: redirect to login after logout
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: "เกิดข้อผิดพลาดในการออกจากระบบ",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      setImageAnalysisResult(null); 
      setShowQaSection(false); 
      setImageError(null);
    }
  };

  const handleImageAnalysis = async () => {
    if (!selectedFile) {
      setImageError('โปรดเลือกไฟล์รูปภาพก่อน');
      return;
    }
    setIsLoadingImageAnalysis(true);
    setImageError(null);
    setImageAnalysisResult(null); 

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const foodPhotoDataUri = reader.result as string;
      try {
        const result = await analyzeFoodImage({ foodPhotoDataUri } as AnalyzeFoodImageInput);
        setImageAnalysisResult(result);
        setShowQaSection(true); 
        if (result.isIdentified) {
          toast({
            title: "การวิเคราะห์เสร็จสมบูรณ์",
            description: `ระบุได้ว่าเป็น: ${result.identification.foodName}`,
          });
        } else {
          toast({
            title: "หมายเหตุการวิเคราะห์",
            description: "ไม่สามารถระบุรายการอาหารได้ คุณสามารถสอบถามรายละเอียดเพิ่มเติมได้ในส่วนถาม-ตอบด้านล่างค่ะ",
            variant: "default"
          });
        }
      } catch (error) {
        console.error('Error analyzing image:', error);
        setImageError('วิเคราะห์รูปภาพไม่สำเร็จ โปรดลองอีกครั้ง');
        toast({
          title: "เกิดข้อผิดพลาดในการวิเคราะห์",
          description: "เกิดข้อผิดพลาดระหว่างการวิเคราะห์รูปภาพ",
          variant: "destructive",
        });
      } finally {
        setIsLoadingImageAnalysis(false);
      }
    };
    reader.onerror = () => {
      setImageError('ไม่สามารถอ่านไฟล์รูปภาพที่เลือก');
      setIsLoadingImageAnalysis(false);
       toast({
          title: "ข้อผิดพลาดในการอ่านไฟล์",
          description: "ไม่สามารถอ่านไฟล์รูปภาพที่เลือก",
          variant: "destructive",
        });
    };
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessageText = chatInput;
    setChatInput(''); 

    const timestamp = serverTimestamp(); 
    const localTimestamp = new Date(); 

    if (currentUser) {
      // Message will be added via Firestore snapshot listener
    } else {
      const newUserMessage: ChatMessage = {
        id: `${Date.now()}-user`,
        sender: 'user',
        text: userMessageText,
        timestamp: localTimestamp,
      };
      setChatMessages((prevMessages) => [...prevMessages, newUserMessage]);
    }


    if (currentUser) {
      try {
        const messagesRef = collection(db, 'userChats', currentUser.uid, 'messages');
        await addDoc(messagesRef, {
          sender: 'user',
          text: userMessageText,
          timestamp: timestamp,
        });
      } catch (error) {
        console.error("Error saving user message:", error);
        toast({ title: "ข้อผิดพลาด", description: "ไม่สามารถบันทึกข้อความของคุณได้", variant: "destructive" });
      }
    }
    
    setIsLoadingQa(true);

    try {
      const foodContextName = imageAnalysisResult?.isIdentified ? imageAnalysisResult.identification.foodName : undefined;
      const aiResponse = await askQuestion({ question: userMessageText, foodName: foodContextName } as AskQuestionInput);
      
      if (currentUser) {
        try {
          const messagesRef = collection(db, 'userChats', currentUser.uid, 'messages');
          await addDoc(messagesRef, {
            sender: 'ai',
            text: aiResponse.answer,
            timestamp: timestamp, 
          });
        } catch (error) {
          console.error("Error saving AI message:", error);
          toast({ title: "ข้อผิดพลาด", description: "ไม่สามารถบันทึกคำตอบของ AI ได้", variant: "destructive" });
        }
      } else {
        const newAiMessage: ChatMessage = {
          id: `${Date.now()}-ai`,
          sender: 'ai',
          text: aiResponse.answer,
          timestamp: localTimestamp, 
        };
        setChatMessages((prevMessages) => [...prevMessages, newAiMessage]);
      }

    } catch (error) {
      console.error('Error asking question:', error);
      const errorText = "ขออภัยค่ะ Momu พบข้อผิดพลาดในการตอบคำถามของคุณ โปรดลองอีกครั้งนะคะ";
      if (currentUser) {
        try {
          const messagesRef = collection(db, 'userChats', currentUser.uid, 'messages');
          await addDoc(messagesRef, {
            sender: 'ai',
            text: errorText,
            timestamp: timestamp,
          });
        } catch (saveError) {
          console.error("Error saving AI error message:", saveError);
        }
      } else {
        const errorAiMessage: ChatMessage = {
          id: `${Date.now()}-ai-error`,
          sender: 'ai',
          text: errorText,
          timestamp: localTimestamp,
        };
        setChatMessages((prevMessages) => [...prevMessages, errorAiMessage]);
      }
       toast({
          title: "ข้อผิดพลาด Q&A",
          description: "เกิดข้อผิดพลาดขณะเรียกดูคำตอบ",
          variant: "destructive",
        });
    } finally {
      setIsLoadingQa(false);
    }
  };

  const handleClearChatHistory = async () => {
    if (!currentUser) {
      toast({ title: "ข้อผิดพลาด", description: "คุณต้องเข้าสู่ระบบเพื่อล้างประวัติการแชท", variant: "destructive" });
      return;
    }

    setIsLoadingQa(true); 
    try {
      const messagesRef = collection(db, 'userChats', currentUser.uid, 'messages');
      const q = query(messagesRef);
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        toast({ title: "ข้อมูล", description: "ไม่มีประวัติการแชทให้ล้าง" });
        return;
      }

      const batch = writeBatch(db);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      toast({ title: "สำเร็จ", description: "ล้างประวัติการแชทเรียบร้อยแล้ว" });
    } catch (error) {
      console.error("Error clearing chat history:", error);
      toast({ title: "ข้อผิดพลาด", description: "ไม่สามารถล้างประวัติการแชทได้", variant: "destructive" });
    } finally {
      setIsLoadingQa(false);
    }
  };


  const chatScrollAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatScrollAreaRef.current) {
      chatScrollAreaRef.current.scrollTo({ 
        top: chatScrollAreaRef.current.scrollHeight
      });
    }
  }, [chatMessages, isLoadingQa]);

  const PageSection: React.FC<{title: string; icon: React.ReactNode; children: React.ReactNode; id: string; className?: string; titleBgColor?: string; titleTextColor?: string;}> = ({ title, icon, children, id, className, titleBgColor = "bg-primary", titleTextColor = "text-primary-foreground" }) => (
    <section id={id} className={`py-12 ${className || ''}`}>
      <div className="container mx-auto px-4">
        <h2 className={`text-4xl font-headline font-semibold text-center mb-10 ${titleTextColor} ${titleBgColor} py-3 rounded-lg shadow-md`}>
          {React.cloneElement(icon as React.ReactElement, { className: "inline-block w-10 h-10 mr-3" })}
          {title}
        </h2>
        {children}
      </div>
    </section>
  );


  return (
    <div className="min-h-screen bg-background text-foreground font-body p-4 md:p-8">
      <header className="py-8 text-center bg-gradient-to-r from-primary/10 via-secondary/20 to-primary/10 rounded-lg shadow-md mb-12">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex-1 text-left md:text-center">
             <Link href="/" className="inline-block">
              <h1 className="text-4xl md:text-5xl font-headline font-bold text-primary flex items-center justify-start md:justify-center">
                <Utensils className="w-10 h-10 md:w-12 md:h-12 mr-2 md:mr-4" />
                FSFA <span className="text-2xl md:text-3xl font-normal ml-2 text-foreground/90">(Food Security For All 🍉🥗)</span>
              </h1>
            </Link>
            <p className="mt-1 md:mt-2 text-lg md:text-xl text-foreground/80 font-body text-left md:text-center">
              สร้างความมั่นคงทางอาหารและสุขภาวะทางโภชนาการที่ดีสำหรับทุกคน
            </p>
          </div>
          <div className="flex-none ml-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full w-12 h-12">
                  <UserCircle className="w-8 h-8 text-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>บัญชีของฉัน</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {currentUser ? (
                  <>
                    <DropdownMenuItem disabled>
                      <span className="truncate">{currentUser.email}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>ออกจากระบบ</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/login" className="flex items-center w-full cursor-pointer">
                        <LogIn className="mr-2 h-4 w-4" />
                        <span>เข้าสู่ระบบ</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/register" className="flex items-center w-full cursor-pointer">
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>ลงทะเบียน</span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 space-y-10 md:space-y-16">

        <PageSection title="มีอะไรอยู่บนจานของคุณ? 🤔🍽️" icon={<Brain />} id="image-scanner" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-primary" titleTextColor="text-primary-foreground">
          <Card className="max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary">AI วิเคราะห์อาหาร 🤖🥕</CardTitle>
              <CardDescription className="text-md font-body">อัปโหลดรูปภาพอาหาร แล้ว AI ของเราจะให้ข้อมูลทางโภชนาการและคำแนะนำด้านความปลอดภัย</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="food-image-upload" className="text-lg font-body text-foreground">อัปโหลดรูปภาพอาหาร</Label>
                <Input id="food-image-upload" type="file" accept="image/*" onChange={handleFileChange} className="mt-2 file:text-accent file:font-semibold file:mr-2 file:px-3 file:py-1 file:rounded-full file:border-0 file:bg-accent/20 hover:file:bg-accent/30 text-lg p-2" />
              </div>

              {previewUrl && (
                <div className="mt-4 text-center border border-dashed border-border p-4 rounded-md">
                  <p className="text-md font-body mb-2 text-muted-foreground">ตัวอย่างรูปภาพ:</p>
                  <Image src={previewUrl} alt="Food preview" width={300} height={300} className="rounded-md shadow-md mx-auto object-contain max-h-64" />
                </div>
              )}

              {imageError && <p className="text-destructive text-sm font-body flex items-center"><AlertCircle className="w-4 h-4 mr-1" />{imageError}</p>}

              <Button onClick={handleImageAnalysis} disabled={isLoadingImageAnalysis || !selectedFile} className="w-full text-lg py-6" size="lg">
                {isLoadingImageAnalysis ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังวิเคราะห์...
                  </>
                ) : (
                  <> <UploadCloud className="mr-2 h-6 w-6" /> วิเคราะห์รูปภาพ </>
                )}
              </Button>

              {imageAnalysisResult && (
                <Card className="mt-8 shadow-md rounded-lg overflow-hidden bg-card border border-primary/30">
                  <CardHeader className="pb-2 bg-primary/10">
                      <CardTitle className="text-xl font-headline text-primary flex items-center">
                      {imageAnalysisResult.isIdentified ? <CheckCircle className="w-6 h-6 mr-2 text-green-500" /> : <Info className="w-6 h-6 mr-2 text-yellow-500" />}
                      ผลการวิเคราะห์
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6 space-y-4">
                    {imageAnalysisResult.isIdentified ? (
                      <>
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground">อาหารที่ระบุได้:</h4>
                          <p className="text-md font-body text-foreground/80">{imageAnalysisResult.identification.foodName} (ความมั่นใจ: {(imageAnalysisResult.identification.confidence * 100).toFixed(0)}%)</p>
                        </div>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground">ข้อมูลทางโภชนาการ:</h4>
                          <ScrollArea className="h-40">
                              <p className="text-md font-body text-foreground/80 whitespace-pre-wrap pr-2">{imageAnalysisResult.nutritionInformation}</p>
                          </ScrollArea>
                        </div>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground">คำแนะนำด้านความปลอดภัย:</h4>
                          <ScrollArea className="h-40">
                              <p className="text-md font-body text-foreground/80 whitespace-pre-wrap pr-2">{imageAnalysisResult.safetyAdvice}</p>
                          </ScrollArea>
                        </div>
                      </>
                    ) : (
                       <p className="text-md font-body text-foreground/80">
                         ขออภัยค่ะ Momu ไม่สามารถระบุรายการอาหารในภาพได้ชัดเจน บางครั้งภาพก็อาจจะซับซ้อน ลองเปลี่ยนมุมถ่ายภาพ ให้มีแสงสว่างเพียงพอ หรืออัปโหลดภาพอื่นได้ไหมคะ? หรือจะถามคำถามเกี่ยวกับอาหารนั้นในส่วน Q&A ด้านล่างก็ได้ค่ะ Momu ยินดีช่วยเหลือค่ะ
                       </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </PageSection>

        {/* Q&A Section */}
        {showQaSection && (
          <PageSection title="Momu Ai 🧑‍⚕️💬" icon={<Bot />} id="qa-section" className="bg-accent/10 rounded-lg shadow-md" titleBgColor="bg-accent" titleTextColor="text-accent-foreground">
            {imageAnalysisResult && !imageAnalysisResult.isIdentified && (
              <Card className="mb-6 bg-yellow-50 border-yellow-300 rounded-lg max-w-2xl mx-auto">
                <CardContent className="p-4">
                  <p className="text-center text-yellow-800 font-body text-md">
                    แม้ว่า Momu จะไม่สามารถระบุอาหารจากภาพได้ แต่คุณสามารถถามคำถามเฉพาะเจาะจงเกี่ยวกับอาหารนั้นหรือหัวข้อโภชนาการทั่วไปได้เลยค่ะ Momu ยินดีตอบค่ะ!
                  </p>
                </CardContent>
              </Card>
            )}
            <Card className="max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-headline text-primary">ถาม-ตอบ 💡</CardTitle>
                  <CardDescription className="text-md font-body">
                    {currentUser ? `คุยกับ Momu Ai (ประวัติการแชทจะถูกบันทึก)` : `คุยกับ Momu Ai (เข้าสู่ระบบเพื่อบันทึกประวัติ)`}
                  </CardDescription>
                </div>
                {currentUser && chatMessages.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" disabled={isLoadingQa || isChatHistoryLoading}>
                        <Trash2 className="w-4 h-4" />
                        <span className="sr-only">ล้างประวัติการแชท</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>ยืนยันการล้างประวัติ</AlertDialogTitle>
                        <AlertDialogDescription>
                          คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติการสนทนาทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                        <AlertDialogAction onClick={handleClearChatHistory} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                          ยืนยันการล้าง
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96 w-full pr-4 border border-border rounded-md p-4 mb-4 bg-secondary/20" viewportRef={chatScrollAreaRef}>
                  {isChatHistoryLoading && (
                     <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <svg className="animate-spin h-8 w-8 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-lg font-body">กำลังโหลดประวัติการแชท...</p>
                     </div>
                  )}
                  {!isChatHistoryLoading && chatMessages.length === 0 && !isLoadingQa && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <MessagesSquare className="w-16 h-16 mb-4" />
                      <p className="text-lg font-body">
                        {imageAnalysisResult?.isIdentified && imageAnalysisResult?.identification.foodName 
                          ? `ถาม Momu Ai เกี่ยวกับ "${imageAnalysisResult.identification.foodName}" หรือเรื่องอื่นๆ ได้เลยค่ะ`
                          : "ถามคำถามเพื่อเริ่มการสนทนากับ Momu Ai ค่ะ"}
                      </p>
                       {imageAnalysisResult?.isIdentified && imageAnalysisResult?.identification.foodName && (
                          <p className="text-sm mt-2">เช่น "ให้ข้อมูลเพิ่มเติมเกี่ยวกับ {imageAnalysisResult.identification.foodName} หน่อยสิ"</p>
                       )}
                    </div>
                  )}
                  {!isChatHistoryLoading && chatMessages.map((msg) => (
                    <div key={msg.id} className={`flex mb-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-3 rounded-xl max-w-[80%] shadow-md ${msg.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <p className="text-md font-body whitespace-pre-wrap">{msg.text}</p>
                        <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-primary-foreground/80 text-right' : 'text-muted-foreground/80 text-left'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isLoadingQa && (
                    <div className="flex mb-4 justify-start">
                      <div className="p-3 rounded-xl max-w-[80%] shadow-md bg-muted text-muted-foreground">
                        <div className="flex items-center">
                          <Bot className="w-5 h-5 mr-2 animate-pulse" />
                          <p className="text-md font-body">Momu Ai กำลังพิมพ์...</p>
                        </div>
                      </div>
                    </div>
                  )}
                </ScrollArea>
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center space-x-2">
                  <Input
                    id="chat-input-momu-ai"
                    type="text"
                    placeholder="พิมพ์คำถามของคุณถึง Momu Ai..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-grow text-lg p-3 h-12"
                    disabled={isLoadingQa || isChatHistoryLoading}
                  />
                  <Button type="submit" disabled={isLoadingQa || isChatHistoryLoading || !chatInput.trim()} size="lg" className="text-lg px-6 h-12 bg-accent hover:bg-accent/90">
                    {isLoadingQa ? (
                       <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        กำลังส่ง...
                      </>
                    ) : "ถาม"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </PageSection>
        )}
      </main>

      <footer className="text-center py-8 mt-12 md:mt-16 border-t border-border/50">
        <p className="text-muted-foreground font-body">&copy; {new Date().getFullYear()} FSFA (Food Security For All) สงวนลิขสิทธิ์</p>
      </footer>
    </div>
  );
}


    
