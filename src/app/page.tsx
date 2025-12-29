
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
  chatWithBot,
  type ChatInput as AIChatInput, 
  type ChatOutput as AIChatOutput, 
  type ChatMessage
} from '@/ai/flows/post-scan-chat';
import { auth, db } from '@/lib/firebase'; 
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'; 
import { doc, setDoc, getDoc, Timestamp, collection, addDoc, query, where, getDocs, onSnapshot } from 'firebase/firestore';


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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';


// Lucide Icons
import { UploadCloud, Brain, AlertCircle, CheckCircle, Info, UserCircle, LogIn, UserPlus, LogOut, Loader2, MessageSquareWarning, Send, MessageCircle, ScanLine, Flame, Calculator, PlusCircle } from 'lucide-react';

const UNIDENTIFIED_FOOD_MESSAGE = "ไม่สามารถระบุชนิดอาหารได้";
const GENERIC_SAFETY_UNAVAILABLE = "ไม่มีคำแนะนำด้านความปลอดภัยเฉพาะสำหรับรายการนี้";

const PageSection: React.FC<{title: string; icon: React.ReactNode; children: React.ReactNode; id: string; className?: string; titleBgColor?: string; titleTextColor?: string;}> = ({ title, icon, children, id, className, titleBgColor = "bg-primary", titleTextColor = "text-primary-foreground" }) => (
  <section id={id} className={`py-6 sm:py-8 md:py-12 ${className || ''}`}>
    <div className="container mx-auto px-4">
      <h2 className={`text-xl sm:text-2xl md:text-3xl font-headline font-semibold text-center mb-4 sm:mb-6 md:mb-8 ${titleTextColor} ${titleBgColor} py-2 sm:py-3 rounded-lg shadow-md`}>
        {React.cloneElement(icon as React.ReactElement, { className: "inline-block w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 mr-2 sm:mr-3" })}
        {title}
      </h2>
      {children}
    </div>
  </section>
);
PageSection.displayName = 'PageSection';

interface UserProfile {
  height?: number;
  weight?: number;
  bmi?: number;
  dailyCalorieGoal?: number;
}

interface DailyLog {
  date: Timestamp;
  consumedCalories: number;
  meals: {
    name: string;
    calories: number;
    timestamp: Timestamp;
  }[];
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
  
  // BMI and Profile State
  const [userProfile, setUserProfile] = useState<UserProfile>({});
  const [height, setHeight] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [isCalculatingBmi, setIsCalculatingBmi] = useState(false);

  // Calorie Log State
  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [dailyLogId, setDailyLogId] = useState<string | null>(null);
  const [isLoggingMeal, setIsLoggingMeal] = useState(false);

  const isFoodIdentified = imageAnalysisResult && imageAnalysisResult.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;

  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);


  const fetchUserProfile = async (user: User) => {
    if (!db) return;
    const userDocRef = doc(db, 'users', user.uid);
    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const profileData = docSnap.data() as UserProfile;
        setUserProfile(profileData);
        if (profileData.height) setHeight(String(profileData.height));
        if (profileData.weight) setWeight(String(profileData.weight));
        console.log("[Profile Fetch] User profile loaded:", profileData);
      } else {
        console.log("[Profile Fetch] No user profile found, starting with empty profile.");
        setUserProfile({});
      }
    } catch (error) {
      console.error("[Profile Fetch] Error fetching user profile:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดข้อมูลโปรไฟล์ผู้ใช้ได้", variant: "destructive"});
    }
  };
  
  // Fetch or create daily log for the user
  const fetchDailyLog = async (user: User) => {
    if (!db) return;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const logsCollection = collection(db, 'users', user.uid, 'dailyLogs');
    const q = query(
      logsCollection,
      where('date', '>=', Timestamp.fromDate(startOfDay)),
      where('date', '<', Timestamp.fromDate(endOfDay))
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        setDailyLog(doc.data() as DailyLog);
        setDailyLogId(doc.id);
        console.log("[Log Fetch] Found today's log:", doc.id);
      } else {
        console.log("[Log Fetch] No log for today. Creating a new one.");
        const newLog: DailyLog = {
          date: Timestamp.fromDate(startOfDay),
          consumedCalories: 0,
          meals: [],
        };
        setDailyLog(newLog);
        setDailyLogId(null); // Will be set after first meal log
      }
    }, (error) => {
      console.error("[Log Fetch] Error fetching daily log:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดข้อมูลบันทึกแคลอรีได้", variant: "destructive"});
    });

    return unsubscribe;
  };


  useEffect(() => {
    let unsubscribeLog: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        fetchUserProfile(user);
        fetchDailyLog(user).then(unsub => { unsubscribeLog = unsub; });
      } else {
        // Reset states for anonymous user
        setUserProfile({});
        setHeight('');
        setWeight('');
        setDailyLog(null);
        setDailyLogId(null);
        if(unsubscribeLog) unsubscribeLog();
      }
    });
    return () => {
      unsubscribeAuth();
      if(unsubscribeLog) unsubscribeLog();
    };
  }, []);

  useEffect(() => {
    if (chatScrollAreaRef.current) {
      const scrollableViewport = chatScrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [chatMessages]);

  
  const handleLogout = async () => {
    if (!auth) {
      console.error("Logout error: Firebase Auth not initialized.");
      toast({ title: "เกิดข้อผิดพลาด", description: "การตั้งค่า Firebase ไม่สมบูรณ์", variant: "destructive" });
      return;
    }
    try {
      await signOut(auth);
      toast({
        title: "ออกจากระบบสำเร็จ",
      });
      console.log('[Logout] User logged out.');
    } catch (error: unknown) {
      console.error("Logout error:", error);
      toast({
        title: "เกิดข้อผิดพลาดในการออกจากระบบ",
        variant: "destructive",
      });
    }
  };

  const resetImageRelatedStates = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageAnalysisResult(null);
    setImageError(null);
    console.log('[State Reset] Image related states reset.');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      resetImageRelatedStates(); 
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      console.log('[File Change] New file selected:', file.name);
    }
  };

  const handleImageAnalysis = async () => {
    if (!selectedFile) {
      setImageError('โปรดเลือกไฟล์รูปภาพก่อน');
      return;
    }
    setIsLoadingImageAnalysis(true);
    setImageError(null);
    
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const foodImage = reader.result as string;
      try {
        const result = await scanFoodImage({ foodImage } as ScanFoodImageInput);
        setImageAnalysisResult(result); 
        
        const identified = result.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;
        if (identified) {
          toast({
            title: "การวิเคราะห์เสร็จสมบูรณ์",
            description: `ระบุได้ว่าเป็น: ${result.foodItem}`,
          });
        } else {
          toast({
            title: "หมายเหตุการวิเคราะห์",
            description: "ไม่สามารถระบุรายการอาหารจากภาพที่ให้มาได้ โปรดลองภาพอื่น",
            variant: "default"
          });
        }
      } catch (error: unknown) {
        console.error('[Image Analysis] Error analyzing image:', error);
        let errorMessage = 'วิเคราะห์รูปภาพไม่สำเร็จ โปรดลองอีกครั้ง';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        setImageError(errorMessage);
        setImageAnalysisResult(null); 
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
      setImageAnalysisResult(null); 
      toast({
          title: "ข้อผิดพลาดในการอ่านไฟล์",
          description: "ไม่สามารถอ่านไฟล์รูปภาพที่เลือก",
          variant: "destructive",
        });
    };
  };

  const handleChatSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const messageContent = chatInput.trim();
    if (!messageContent) return;

    const newUserMessage: ChatMessage = { role: 'user', content: messageContent };
    setChatMessages(prev => [...prev, newUserMessage]);
    setChatInput('');
    if(chatInputRef.current) chatInputRef.current.value = ''; // Clear textarea
    setIsChatLoading(true);

    try {
      const chatHistoryForAPI = chatMessages.slice(-5); 
      const result: AIChatOutput = await chatWithBot({ message: messageContent, history: chatHistoryForAPI });
      const newBotMessage: ChatMessage = { role: 'model', content: result.response };
      setChatMessages(prev => [...prev, newBotMessage]);
    } catch (error) {
      console.error("Error in chatWithBot:", error);
      const errorMessage: ChatMessage = { role: 'model', content: "ขออภัยค่ะ มีปัญหาในการเชื่อมต่อกับ AI โปรดลองอีกครั้ง" };
      setChatMessages(prev => [...prev, errorMessage]);
      toast({
        title: "Chatbot Error",
        description: "ไม่สามารถรับการตอบกลับจาก AI ได้",
        variant: "destructive",
      });
    } finally {
      setIsChatLoading(false);
       if(chatInputRef.current) chatInputRef.current.focus();
    }
  };

  const handleCalculateBmi = async () => {
    const h = parseFloat(height);
    const w = parseFloat(weight);

    if (isNaN(h) || isNaN(w) || h <= 0 || w <= 0) {
      toast({ title: "ข้อมูลไม่ถูกต้อง", description: "โปรดกรอกส่วนสูงและน้ำหนักให้ถูกต้อง", variant: "destructive"});
      return;
    }

    setIsCalculatingBmi(true);
    const bmi = w / ((h / 100) * (h / 100));
    // Simple BMR calculation (Mifflin-St Jeor, assuming age 30, sedentary)
    // This is a placeholder. A real app would ask for age, gender, activity level.
    const calorieGoal = (10 * w) + (6.25 * h) - (5 * 30) + 5; // Male example
    const roundedCalorieGoal = Math.round(calorieGoal * 1.2); // Sedentary

    const newProfile: UserProfile = {
      height: h,
      weight: w,
      bmi: parseFloat(bmi.toFixed(2)),
      dailyCalorieGoal: roundedCalorieGoal,
    };
    
    setUserProfile(newProfile);

    if (currentUser && db) {
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await setDoc(userDocRef, newProfile, { merge: true });
        toast({ title: "คำนวณและบันทึกข้อมูลสำเร็จ", description: `BMI ของคุณคือ ${newProfile.bmi} และแนะนำแคลอรีต่อวัน ${newProfile.dailyCalorieGoal} kcal` });
      } catch (error) {
        console.error("Error saving profile to Firestore:", error);
        toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกข้อมูลโปรไฟล์ได้", variant: "destructive"});
      }
    } else {
      toast({ title: "คำนวณสำเร็จ", description: "ข้อมูลนี้จะถูกบันทึกเมื่อคุณเข้าสู่ระบบ", variant: "default" });
    }
    setIsCalculatingBmi(false);
  };

  const handleLogMeal = async (mealName: string, mealCalories: number) => {
    if (!currentUser || !db) {
      toast({ title: "กรุณาเข้าสู่ระบบ", description: "คุณต้องเข้าสู่ระบบเพื่อบันทึกมื้ออาหาร", variant: "destructive" });
      return;
    }
    if (!dailyLog) {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่พบข้อมูลบันทึกประจำวัน", variant: "destructive" });
      return;
    }

    setIsLoggingMeal(true);

    const newMeal = {
      name: mealName,
      calories: mealCalories,
      timestamp: Timestamp.now(),
    };

    const newConsumedCalories = dailyLog.consumedCalories + mealCalories;
    const newMeals = [...dailyLog.meals, newMeal];

    try {
      const userLogsCollection = collection(db, 'users', currentUser.uid, 'dailyLogs');
      let docRef;

      if (dailyLogId) {
        docRef = doc(userLogsCollection, dailyLogId);
        await setDoc(docRef, { consumedCalories: newConsumedCalories, meals: newMeals }, { merge: true });
      } else {
        const newLogData = { ...dailyLog, consumedCalories: newConsumedCalories, meals: newMeals };
        docRef = await addDoc(userLogsCollection, newLogData);
        setDailyLogId(docRef.id);
      }
      
      toast({ title: "บันทึกมื้ออาหารสำเร็จ", description: `${mealName} (${mealCalories} kcal) ถูกเพิ่มในบันทึกของคุณ` });
      
      if(userProfile.dailyCalorieGoal && newConsumedCalories > userProfile.dailyCalorieGoal) {
        toast({ title: "คำเตือน!", description: "คุณบริโภคเกินเป้าหมายแคลอรีสำหรับวันนี้แล้ว!", variant: "default" });
      }

    } catch (error) {
      console.error("[Log Meal] Error logging meal:", error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกมื้ออาหารได้", variant: "destructive" });
    } finally {
      setIsLoggingMeal(false);
    }
  };


  const getBmiInterpretation = (bmi: number | undefined): {text: string, color: string} => {
    if (bmi === undefined) return {text: 'N/A', color: 'text-foreground'};
    if (bmi < 18.5) return { text: 'ผอม', color: 'text-blue-500' };
    if (bmi < 23) return { text: 'สมส่วน', color: 'text-green-500' };
    if (bmi < 25) return { text: 'ท้วม', color: 'text-yellow-500' };
    if (bmi < 30) return { text: 'อ้วนระดับ 1', color: 'text-orange-500' };
    return { text: 'อ้วนระดับ 2 (อันตราย)', color: 'text-red-500' };
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-2 sm:p-4 md:p-8">
      <header className="py-4 sm:py-6 md:py-8 text-center bg-gradient-to-r from-primary/10 via-secondary/20 to-primary/10 rounded-lg shadow-md mb-6 sm:mb-8 md:mb-12">
        <div className="container mx-auto px-2 sm:px-4 flex justify-between items-center">
          <div className="flex-1 text-left md:text-center">
            <Link href="/" className="inline-block">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-headline font-bold text-primary flex items-center justify-start md:justify-center">
                <ScanLine className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 mr-1 sm:mr-2 md:mr-4" />
                MOMU SCAN
              </h1>
            </Link>
            <p className="mt-1 text-xs sm:text-sm md:text-base lg:text-lg text-foreground/80 font-body text-left md:text-center">
              สแกนอาหารของคุณ เพื่อสุขภาพที่ดีกว่า
            </p>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3 ml-1 sm:ml-2 md:ml-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 group">
                  <UserCircle className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-accent group-hover:text-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  {currentUser ? "บัญชีของฉัน" : "เข้าสู่ระบบ"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {currentUser ? (
                  <>
                    <DropdownMenuItem disabled>
                      <span className="truncate">{currentUser.email}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>ออกจากระบบ</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onSelect={() => router.push('/login')} className="cursor-pointer">
                        <LogIn className="mr-2 h-4 w-4" />
                        <span>เข้าสู่ระบบ</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => router.push('/register')} className="cursor-pointer">
                        <UserPlus className="mr-2 h-4 w-4" />
                        <span>ลงทะเบียน</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-1 sm:px-2 md:px-4 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 md:gap-10 lg:gap-16">

        <div className="lg:col-span-2 space-y-6 sm:space-y-8 md:space-y-10 lg:space-y-16">
          <PageSection title="อาหารอะไรที่อยู่บนจานของคุณ? 🤔🍽️" icon={<Brain />} id="image-scanner" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-primary" titleTextColor="text-primary-foreground">
            <Card className="max-w-xl md:max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-xl md:text-2xl font-headline text-primary">AI วิเคราะห์อาหาร 🤖🥕</CardTitle>
                <CardDescription className="text-xs sm:text-sm md:text-base font-body">อัปโหลดรูปภาพอาหาร แล้ว AI ของเราจะให้ข้อมูลทางโภชนาการและคำแนะนำด้านความปลอดภัย</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3 sm:space-y-4 md:space-y-6">
                <div>
                  <Label htmlFor="food-image-upload" className="text-sm sm:text-base md:text-lg font-body text-foreground">อัปโหลดรูปภาพอาหาร</Label>
                  <Input id="food-image-upload" type="file" accept="image/*" onChange={handleFileChange} className="mt-1 sm:mt-2 file:text-primary-foreground file:font-semibold file:mr-2 file:px-2 sm:file:px-3 file:py-1 file:rounded-md file:border-0 file:bg-primary hover:file:bg-primary/90 text-xs sm:text-sm md:text-base p-1 sm:p-2" />
                </div>
                
                {previewUrl && (
                   <div className="mt-2 sm:mt-4 md:mt-6 mb-2 sm:mb-4 md:mb-6 flex flex-col items-center space-y-1 sm:space-y-2 md:space-y-4 border border-border/60 p-2 sm:p-4 md:p-6 rounded-lg bg-muted/20 shadow-inner">
                      <div className="flex-shrink-0 flex flex-col items-center">
                        <p className="text-xs sm:text-sm font-body mb-1 sm:mb-2 text-muted-foreground">ตัวอย่างรูปภาพ:</p>
                        <Image src={previewUrl} alt="Food preview" width={150} height={150} className="rounded-lg shadow-md object-contain max-h-36 sm:max-h-48 md:max-h-56 mx-auto" data-ai-hint="food meal" />
                      </div>
                    </div>
                )}

                {imageError && <p className="text-destructive text-xs sm:text-sm font-body flex items-center"><AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />{imageError}</p>}

                <Button onClick={handleImageAnalysis} disabled={isLoadingImageAnalysis || !selectedFile} className="w-full text-sm sm:text-base md:text-lg py-2 sm:py-3 md:py-4" size="default">
                  {isLoadingImageAnalysis ? (
                    <><Loader2 className="animate-spin -ml-1 mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:h-5" />กำลังวิเคราะห์...</>
                  ) : (
                    <> <UploadCloud className="mr-2 h-4 w-4 sm:h-5 sm:h-5 md:h-6 md:w-6" /> วิเคราะห์รูปภาพ </>
                  )}
                </Button>

                {imageAnalysisResult && (
                  <Card className="mt-4 sm:mt-6 md:mt-8 shadow-md rounded-lg overflow-hidden bg-card border border-primary/30">
                    <CardHeader className="p-3 sm:p-4 pb-1 sm:pb-2 bg-primary/10">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base sm:text-lg md:text-xl font-headline text-primary flex items-center">
                        {isFoodIdentified ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mr-2 text-green-500" /> : <Info className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mr-2 text-yellow-500" />}
                        ผลการวิเคราะห์
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 md:p-6 space-y-2 sm:space-y-3 md:space-y-4">
                      <div>
                        <h4 className="font-semibold text-sm sm:text-base md:text-lg font-body text-foreground">
                          {imageAnalysisResult.foodItem === UNIDENTIFIED_FOOD_MESSAGE ? "อาหารที่ระบุได้:" : "อาหารที่ระบุได้:"}
                        </h4>
                        <p className="text-xs sm:text-sm md:text-base font-body text-foreground/80">
                          {imageAnalysisResult.foodItem === UNIDENTIFIED_FOOD_MESSAGE 
                             ? "ขออภัยค่ะ ไม่สามารถระบุรายการอาหารในภาพได้ชัดเจน โปรดลองภาพอื่นที่มีแสงสว่างเพียงพอ หรือลองเปลี่ยนมุมถ่ายภาพนะคะ"
                             : imageAnalysisResult.foodItem
                          }
                        </p>
                      </div>
                      
                      {isFoodIdentified && imageAnalysisResult.nutritionalInformation && imageAnalysisResult.nutritionalInformation.estimatedCalories > 0 && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-semibold text-sm sm:text-base md:text-lg font-body text-foreground flex items-center"><Flame className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-orange-500" />แคลอรีโดยประมาณ:</h4>
                            <div className="mt-1 text-xs sm:text-sm md:text-base font-body text-foreground/80 space-y-1">
                               <div className="flex items-center justify-between">
                                <p className="text-lg sm:text-xl font-bold text-primary">{imageAnalysisResult.nutritionalInformation.estimatedCalories} กิโลแคลอรี</p>
                                <Button
                                  size="sm"
                                  onClick={() => handleLogMeal(imageAnalysisResult.foodItem, imageAnalysisResult.nutritionalInformation.estimatedCalories)}
                                  disabled={isLoggingMeal || !currentUser}
                                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                                >
                                  {isLoggingMeal ? <Loader2 className="animate-spin mr-2" /> : <PlusCircle className="mr-2"/>}
                                  เพิ่มในบันทึก
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">{imageAnalysisResult.nutritionalInformation.reasoning}</p>
                              
                              <p className="font-semibold pt-2">ส่วนผสมที่ใช้ประเมิน:</p>
                              <ul className="list-disc pl-4 sm:pl-5 space-y-1">
                                {imageAnalysisResult.nutritionalInformation.visibleIngredients.map((ingredient, index) => (
                                  <li key={index}>{ingredient}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </>
                      )}

                      {isFoodIdentified && (imageAnalysisResult.safetyPrecautions && imageAnalysisResult.safetyPrecautions.some(p => p !== GENERIC_SAFETY_UNAVAILABLE)) && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-semibold text-sm sm:text-base md:text-lg font-body text-foreground flex items-center">
                              <MessageSquareWarning className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 mr-1 sm:mr-2 text-orange-500"/>คำแนะนำด้านความปลอดภัย:
                            </h4>
                            <ul className="list-disc pl-3 sm:pl-4 md:pl-5 space-y-1 text-xs sm:text-sm md:text-base font-body text-foreground/80 mt-1 sm:mt-2">
                              {imageAnalysisResult.safetyPrecautions.map((precaution, index) => (
                                precaution !== GENERIC_SAFETY_UNAVAILABLE ? <li key={index}>{precaution}</li> : null
                              )).filter(Boolean)}
                            </ul>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </PageSection>

          <PageSection title="พูดคุยกับ AI ผู้ช่วย 💬🧠" icon={<MessageCircle />} id="chatbot-section" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-accent" titleTextColor="text-accent-foreground">
            <Card className="max-w-xl md:max-w-2xl mx-auto shadow-lg rounded-lg overflow-hidden bg-card">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-lg sm:text-xl md:text-2xl font-headline text-accent">Momu Ai</CardTitle>
                <CardDescription className="text-xs sm:text-sm md:text-base font-body">สอบถามเกี่ยวกับอาหารและโภชนาการได้ที่นี้😉</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-2 sm:space-y-3 md:space-y-4">
                <ScrollArea className="h-48 sm:h-60 md:h-72 w-full border rounded-md p-2 sm:p-4 bg-muted/30" viewportRef={chatScrollAreaRef}>
                  {chatMessages.length === 0 && (
                    <p className="text-center text-xs sm:text-sm md:text-base text-muted-foreground">เริ่มต้นการสนทนาได้เลยค่ะ...</p>
                  )}
                  {chatMessages.map((msg, index) => (
                    <div key={index} className={`mb-1 sm:mb-2 md:mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-2 sm:p-3 rounded-lg max-w-[80%] shadow ${ msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                        <p className="text-xs sm:text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start mb-1 sm:mb-2">
                      <div className="p-2 sm:p-3 rounded-lg bg-secondary text-secondary-foreground shadow">
                        <Loader2 className="h-3 w-3 sm:h-4 sm:h-4 md:h-5 md:h-5 animate-spin" />
                      </div>
                    </div>
                  )}
                </ScrollArea>
                <form onSubmit={handleChatSubmit} className="flex items-center space-x-1 sm:space-x-2">
                  <Textarea ref={chatInputRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="พิมพ์ข้อความของคุณที่นี่..." className="flex-grow resize-none p-2 md:p-3 text-xs sm:text-sm md:text-base" rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); } }} />
                  <Button type="submit" size="default" className="text-sm sm:text-base md:text-lg py-2 md:py-3 px-2 sm:px-3 md:px-4" disabled={isChatLoading || !chatInput.trim()}>
                    {isChatLoading ? <Loader2 className="animate-spin h-3 w-3 sm:h-4 sm:h-4 md:h-5 md:h-5" /> : <Send className="h-3 w-3 sm:h-4 sm:h-4 md:h-5 md:h-5" />}
                    <span className="sr-only">Send</span>
                  </Button>
                </form>
              </CardContent>
            </Card>
          </PageSection>
        </div>

        <div className="lg:col-span-1 space-y-6 sm:space-y-8 md:space-y-10 lg:space-y-16">
          <PageSection title="โปรไฟล์และ BMI ของคุณ" icon={<Calculator />} id="bmi-calculator" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-primary" titleTextColor="text-primary-foreground">
            <div className="space-y-4">
              <Card className="shadow-lg rounded-lg overflow-hidden bg-card">
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl font-headline text-primary">คำนวณ BMI และแคลอรี</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">กรอกข้อมูลเพื่อคำนวณดัชนีมวลกายและแคลอรีที่แนะนำต่อวัน</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="height">ส่วนสูง (ซม.)</Label>
                    <Input id="height" type="number" placeholder="เช่น 165" value={height} onChange={(e) => setHeight(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight">น้ำหนัก (กก.)</Label>
                    <Input id="weight" type="number" placeholder="เช่น 55" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  </div>
                   <Button onClick={handleCalculateBmi} disabled={isCalculatingBmi} className="w-full">
                     {isCalculatingBmi ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Calculator className="mr-2 h-4 w-4" />}
                     คำนวณ BMI และแคลอรี
                   </Button>
                   {!currentUser && <p className="text-center text-xs text-muted-foreground pt-2">กรุณาเข้าสู่ระบบเพื่อบันทึกข้อมูล</p>}
                </CardContent>
                {userProfile.bmi && (
                  <CardFooter className="flex flex-col items-start space-y-3 pt-4 border-t">
                     <div>
                      <h4 className="font-semibold text-foreground">BMI ของคุณ:</h4>
                      <p className={`text-2xl font-bold ${getBmiInterpretation(userProfile.bmi).color}`}>{userProfile.bmi} ({getBmiInterpretation(userProfile.bmi).text})</p>
                     </div>
                     {userProfile.dailyCalorieGoal && (
                        <div>
                            <h4 className="font-semibold text-foreground">แคลอรีที่แนะนำต่อวัน:</h4>
                            <p className="text-2xl font-bold text-primary">{userProfile.dailyCalorieGoal.toLocaleString()} <span className="text-sm font-normal">kcal</span></p>
                        </div>
                     )}
                  </CardFooter>
                )}
              </Card>
              <Card className="mt-4 shadow-lg rounded-lg overflow-hidden bg-card">
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl font-headline text-primary">ภาพรวมแคลอรีวันนี้</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                  {currentUser ? (
                    userProfile.dailyCalorieGoal ? (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">เป้าหมาย</p>
                          <p className="text-2xl font-bold text-primary">{userProfile.dailyCalorieGoal.toLocaleString()} <span className="text-sm font-normal">kcal</span></p>
                        </div>
                        <Separator/>
                        <div>
                          <p className="text-sm text-muted-foreground">ใช้ไปแล้ว</p>
                          <p className={`text-3xl font-bold ${dailyLog && userProfile.dailyCalorieGoal && dailyLog.consumedCalories > userProfile.dailyCalorieGoal ? 'text-destructive' : 'text-green-500'}`}>
                            {dailyLog?.consumedCalories.toLocaleString() ?? 0} <span className="text-base font-normal">kcal</span>
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm">กรุณาคำนวณ BMI เพื่อตั้งค่าเป้าหมายแคลอรีของคุณ</p>
                    )
                  ) : (
                    <p className="text-muted-foreground text-sm">กรุณาเข้าสู่ระบบเพื่อดูและบันทึกแคลอรี</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </PageSection>
        </div>
      </main>

      <footer className="text-center py-4 sm:py-6 md:py-8 mt-6 sm:mt-8 md:mt-12 lg:mt-16 border-t border-border/50">
        
      </footer>
    </div>
  );
}

    

    
