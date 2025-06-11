
"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  scanFoodImage, 
  type ScanFoodImageInput, 
  type ScanFoodImageOutput 
} from '@/ai/flows/food-image-analyzer';
import {
  answerUserQuestion,
  type AnswerUserQuestionInput,
  type AnswerUserQuestionOutput,
} from '@/ai/flows/post-scan-chat';
import { auth, db } from '@/lib/firebase'; 
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, getDocs } from 'firebase/firestore'; 

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
import { Textarea } from '@/components/ui/textarea'; 

// Lucide Icons
import { UploadCloud, Brain, Utensils, AlertCircle, CheckCircle, Info, UserCircle, LogIn, UserPlus, LogOut, ListChecks, Bot, Send, Trash2, Loader2 } from 'lucide-react';

const UNIDENTIFIED_FOOD_MESSAGE = "ไม่สามารถระบุชนิดอาหารได้";
const GENERIC_NUTRITION_UNAVAILABLE = "ไม่สามารถระบุข้อมูลทางโภชนาการได้";
const GENERIC_SAFETY_UNAVAILABLE = "ไม่มีคำแนะนำด้านความปลอดภัยเฉพาะสำหรับรายการนี้";

interface ChatMessage {
  id?: string; // Firestore document ID
  sender: 'user' | 'ai';
  text: string;
  timestamp?: Date | any; 
}

export default function FSFAPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageAnalysisResult, setImageAnalysisResult] = useState<ScanFoodImageOutput | null>(null);
  const [isLoadingImageAnalysis, setIsLoadingImageAnalysis] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // State for Post-Scan Chat
  const [postScanChatMessages, setPostScanChatMessages] = useState<ChatMessage[]>([]);
  const [userPostScanQuestion, setUserPostScanQuestion] = useState('');
  const [isLoadingPostScanChat, setIsLoadingPostScanChat] = useState(false);
  const [postScanChatError, setPostScanChatError] = useState<string | null>(null);
  const currentFoodContext = useRef<string | null>(null);

  const chatScrollAreaRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);


  const isFoodIdentified = imageAnalysisResult && imageAnalysisResult.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        loadChatHistoryFromFirestore(user.uid);
      } else {
        setPostScanChatMessages([]); 
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    // Check if the chat input is currently focused
    const isChatInputFocused = document.activeElement === chatInputRef.current;

    if (chatScrollAreaRef.current && !isChatInputFocused) {
      chatScrollAreaRef.current.scrollTop = chatScrollAreaRef.current.scrollHeight;
    }
  }, [postScanChatMessages]); // Only scroll when messages actually change

  useEffect(() => {
    if (isFoodIdentified && imageAnalysisResult) {
      currentFoodContext.current = imageAnalysisResult.foodItem;
    } else {
      currentFoodContext.current = null;
    }
  }, [imageAnalysisResult, isFoodIdentified]);


  const loadChatHistoryFromFirestore = (userId: string) => {
    const messagesCol = collection(db, `userPostScanChats/${userId}/messages`);
    const q = query(messagesCol, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setPostScanChatMessages(messages);
    }, (error) => {
      console.error("Error loading chat history: ", error);
      toast({ title: "ข้อผิดพลาด", description: "ไม่สามารถโหลดประวัติการสนทนาได้", variant: "destructive" });
    });
    return unsubscribe; 
  };

  const saveChatMessageToFirestore = async (userId: string, message: Omit<ChatMessage, 'id'>) => {
    try {
      await addDoc(collection(db, `userPostScanChats/${userId}/messages`), {
        ...message,
        timestamp: serverTimestamp() 
      });
    } catch (error) {
      console.error("Error saving chat message: ", error);
      toast({ title: "ข้อผิดพลาด", description: "ไม่สามารถบันทึกข้อความสนทนาได้", variant: "destructive" });
    }
  };

  const handleClearChatHistory = async () => {
    if (!currentUser) return;
    setIsLoadingPostScanChat(true);
    try {
      const messagesColRef = collection(db, `userPostScanChats/${currentUser.uid}/messages`);
      const querySnapshot = await getDocs(messagesColRef);
      const deletePromises: Promise<void>[] = [];
      querySnapshot.forEach((doc) => {
        deletePromises.push(deleteDoc(doc.ref));
      });
      await Promise.all(deletePromises);
      setPostScanChatMessages([]); 
      toast({ title: "สำเร็จ", description: "ลบประวัติการสนทนาแล้ว" });
    } catch (error) {
      console.error("Error clearing chat history:", error);
      toast({ title: "ข้อผิดพลาด", description: "ไม่สามารถลบประวัติการสนทนาได้", variant: "destructive" });
    } finally {
      setIsLoadingPostScanChat(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "ออกจากระบบสำเร็จ",
      });
      resetState();
      setPostScanChatMessages([]); 
      currentFoodContext.current = null;
    } catch (error: unknown) {
      console.error("Logout error:", error);
      toast({
        title: "เกิดข้อผิดพลาดในการออกจากระบบ",
        variant: "destructive",
      });
    }
  };

  const resetState = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageAnalysisResult(null);
    setImageError(null);
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
    // Keep previous imageAnalysisResult to keep chat open if user re-analyzes while chat is open
    // setImageAnalysisResult(null); 

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const foodImage = reader.result as string;
      try {
        const result = await scanFoodImage({ foodImage } as ScanFoodImageInput);
        setImageAnalysisResult(result);
        
        const identified = result.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;
        if (identified) {
          currentFoodContext.current = result.foodItem;
          toast({
            title: "การวิเคราะห์เสร็จสมบูรณ์",
            description: `ระบุได้ว่าเป็น: ${result.foodItem}`,
          });
        } else {
          currentFoodContext.current = null;
          toast({
            title: "หมายเหตุการวิเคราะห์",
            description: "ไม่สามารถระบุรายการอาหารจากภาพที่ให้มาได้ โปรดลองภาพอื่น",
            variant: "default"
          });
        }
      } catch (error: unknown) {
        console.error('Error analyzing image:', error);
        let errorMessage = 'วิเคราะห์รูปภาพไม่สำเร็จ โปรดลองอีกครั้ง';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        setImageError(errorMessage);
        toast({
          title: "เกิดข้อผิดพลาดในการวิเคราะห์",
          description: errorMessage,
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

  const handlePostScanChatSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const question = userPostScanQuestion.trim();
    if (!question || isLoadingPostScanChat) return;

    const newUserMessage: ChatMessage = { sender: 'user', text: question, timestamp: new Date() };
    setPostScanChatMessages(prev => [...prev, newUserMessage]);
    setUserPostScanQuestion('');
    setIsLoadingPostScanChat(true);
    setPostScanChatError(null);

    if (currentUser) {
      // Pass Omit<ChatMessage, 'id'> as saveChatMessageToFirestore expects it
      const { id, ...messageToSave } = newUserMessage; //eslint-disable-line @typescript-eslint/no-unused-vars
      await saveChatMessageToFirestore(currentUser.uid, messageToSave);
    }
    
    const aiChatHistory = postScanChatMessages.slice(-5).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      content: msg.text
    }));


    try {
      const input: AnswerUserQuestionInput = {
        question,
        foodName: currentFoodContext.current || undefined,
        chatHistory: aiChatHistory,
      };
      const result = await answerUserQuestion(input);
      const aiResponse: ChatMessage = { sender: 'ai', text: result.answer, timestamp: new Date() };
      setPostScanChatMessages(prev => [...prev, aiResponse]);
      if (currentUser) {
        const { id, ...messageToSave } = aiResponse; //eslint-disable-line @typescript-eslint/no-unused-vars
        await saveChatMessageToFirestore(currentUser.uid, messageToSave);
      }
    } catch (error: unknown) {
      console.error('Error getting AI answer:', error);
      let errorMsg = "ขออภัยค่ะ มีบางอย่างผิดพลาด Momu Ai ตอบไม่ได้ตอนนี้";
      if (error instanceof Error) errorMsg = error.message;
      setPostScanChatError(errorMsg);
      const aiErrorResponse: ChatMessage = { sender: 'ai', text: errorMsg, timestamp: new Date() };
      setPostScanChatMessages(prev => [...prev, aiErrorResponse]);
       if (currentUser) {
        const { id, ...messageToSave } = aiErrorResponse; //eslint-disable-line @typescript-eslint/no-unused-vars
        await saveChatMessageToFirestore(currentUser.uid, messageToSave);
      }
    } finally {
      setIsLoadingPostScanChat(false);
      chatInputRef.current?.focus();
    }
  };


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
                     <DropdownMenuItem onClick={handleClearChatHistory} disabled={isLoadingPostScanChat} className="cursor-pointer">
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>ล้างประวัติแชท</span>
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
                    <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
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
                      {isFoodIdentified ? <CheckCircle className="w-6 h-6 mr-2 text-green-500" /> : <Info className="w-6 h-6 mr-2 text-yellow-500" />}
                      ผลการวิเคราะห์
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6 space-y-4">
                    {isFoodIdentified ? (
                      <>
                        <div>
                          <h4 className="font-semibold text-lg font-body text-foreground">อาหารที่ระบุได้:</h4>
                          <p className="text-md font-body text-foreground/80">{imageAnalysisResult.foodItem}</p>
                        </div>
                        {imageAnalysisResult.nutritionalInformation !== GENERIC_NUTRITION_UNAVAILABLE && (
                          <>
                            <Separator />
                            <div>
                              <h4 className="font-semibold text-lg font-body text-foreground">ข้อมูลทางโภชนาการ:</h4>
                              <ScrollArea className="max-h-40 pr-2">
                                  <p className="text-md font-body text-foreground/80 whitespace-pre-wrap">{imageAnalysisResult.nutritionalInformation}</p>
                              </ScrollArea>
                            </div>
                          </>
                        )}
                        {(imageAnalysisResult.safetyPrecautions && imageAnalysisResult.safetyPrecautions.some(p => p !== GENERIC_SAFETY_UNAVAILABLE)) && (
                          <>
                            <Separator />
                            <div>
                              <h4 className="font-semibold text-lg font-body text-foreground flex items-center">
                                <ListChecks className="w-5 h-5 mr-2"/>คำแนะนำด้านความปลอดภัย:
                              </h4>
                              <ScrollArea className="max-h-40 mt-2 pr-2">
                                  <ul className="list-disc pl-5 space-y-1 text-md font-body text-foreground/80">
                                    {imageAnalysisResult.safetyPrecautions.map((precaution, index) => (
                                      precaution !== GENERIC_SAFETY_UNAVAILABLE ? <li key={index}>{precaution}</li> : null
                                    )).filter(Boolean)}
                                  </ul>
                              </ScrollArea>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                       <p className="text-md font-body text-foreground/80">
                         {imageAnalysisResult.foodItem === UNIDENTIFIED_FOOD_MESSAGE 
                           ? "ขออภัยค่ะ ไม่สามารถระบุรายการอาหารในภาพได้ชัดเจน โปรดลองภาพอื่นที่มีแสงสว่างเพียงพอ หรือลองเปลี่ยนมุมถ่ายภาพนะคะ"
                           : `ข้อมูลสำหรับ "${imageAnalysisResult.foodItem}" อาจมีจำกัด`}
                       </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </PageSection>

        {imageAnalysisResult && ( 
          <PageSection title="คุยกับ Momu Ai 🧑‍⚕️💬" icon={<Bot />} id="post-scan-chat" className="bg-secondary/20 rounded-lg shadow-md" titleBgColor="bg-accent" titleTextColor="text-accent-foreground">
            <Card className="max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-accent">
                  {currentFoodContext.current ? `สอบถามเกี่ยวกับ "${currentFoodContext.current}"` : "สอบถามข้อมูลทั่วไป"}
                </CardTitle>
                <CardDescription className="text-md font-body">
                  {currentFoodContext.current 
                    ? `Momu Ai พร้อมตอบคำถามเกี่ยวกับ "${currentFoodContext.current}" หรือเรื่องโภชนาการอื่นๆ ที่คุณสงสัย`
                    : "Momu Ai พร้อมตอบคำถามเกี่ยวกับอาหารและโภชนาการที่คุณสงสัย"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-80 w-full border rounded-md p-4" viewportRef={chatScrollAreaRef}>
                  {postScanChatMessages.map((msg, index) => (
                    <div key={msg.id || `${msg.sender}-${msg.timestamp?.toString()}-${index}`} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} mb-3`}>
                      <div className={`max-w-[70%] p-3 rounded-lg shadow ${msg.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                         {msg.timestamp && typeof msg.timestamp.toDate === 'function' && (
                          <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground/70 text-left'}`}>
                            {new Date(msg.timestamp.toDate()).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                         {msg.timestamp && !(typeof msg.timestamp.toDate === 'function') && msg.timestamp instanceof Date && (
                            <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground/70 text-left'}`}>
                                {msg.timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                         )}
                      </div>
                    </div>
                  ))}
                  {isLoadingPostScanChat && (
                    <div className="flex justify-start mb-3">
                      <div className="max-w-[70%] p-3 rounded-lg shadow bg-muted text-muted-foreground animate-pulse">
                        <p className="text-sm flex items-center">
                          <Bot className="w-4 h-4 mr-2 animate-bounce" />
                          Momu Ai กำลังพิมพ์...
                        </p>
                      </div>
                    </div>
                  )}
                  {postScanChatError && (
                     <div className="flex justify-start mb-3">
                        <div className="max-w-[70%] p-3 rounded-lg shadow bg-destructive text-destructive-foreground">
                           <p className="text-sm">{postScanChatError}</p>
                        </div>
                    </div>
                  )}
                </ScrollArea>
                <form onSubmit={handlePostScanChatSubmit} className="flex items-center gap-2">
                  <Textarea
                    id="chat-input-post-scan"
                    ref={chatInputRef}
                    value={userPostScanQuestion}
                    onChange={(e) => setUserPostScanQuestion(e.target.value)}
                    placeholder={currentFoodContext.current ? `ถามเกี่ยวกับ ${currentFoodContext.current}...` : "พิมพ์คำถามของคุณที่นี่..."}
                    className="flex-grow resize-none p-3 text-lg"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handlePostScanChatSubmit();
                      }
                    }}
                    disabled={isLoadingPostScanChat}
                  />
                  <Button type="submit" size="lg" className="px-6 py-6 text-lg" disabled={isLoadingPostScanChat || !userPostScanQuestion.trim()}>
                    {isLoadingPostScanChat ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    <span className="sr-only">ส่ง</span>
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


    