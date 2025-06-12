
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
import { auth, db, serverTimestamp } from '@/lib/firebase'; 
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp as FirestoreTimestamp, doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';


// ShadCN UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from '@/components/ui/skeleton';


// Lucide Icons
import { UploadCloud, Brain, Utensils, AlertCircle, CheckCircle, Info, UserCircle, LogIn, UserPlus, LogOut, ListChecks, Loader2, Heart, ChefHat, CalendarDays } from 'lucide-react';

const UNIDENTIFIED_FOOD_MESSAGE = "ไม่สามารถระบุชนิดอาหารได้";
const GENERIC_NUTRITION_UNAVAILABLE = "ไม่สามารถระบุข้อมูลทางโภชนาการได้";
const GENERIC_SAFETY_UNAVAILABLE = "ไม่มีคำแนะนำด้านความปลอดภัยเฉพาะสำหรับรายการนี้";

// Define PageSection outside of FSFAPage component
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
PageSection.displayName = 'PageSection';

interface LikedMeal {
  id: string;
  foodName: string;
  imageUrl: string;
  likedAt: FirestoreTimestamp; 
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
  
  const [isLiking, setIsLiking] = useState(false);
  const [isAlreadyLiked, setIsAlreadyLiked] = useState(false);

  const [isMyMealsDialogOpen, setIsMyMealsDialogOpen] = useState(false);
  const [likedMeals, setLikedMeals] = useState<LikedMeal[]>([]);
  const [isLoadingMyMeals, setIsLoadingMyMeals] = useState(false);


  const isFoodIdentified = imageAnalysisResult && imageAnalysisResult.foodItem !== UNIDENTIFIED_FOOD_MESSAGE;

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        resetState(); 
      }
    });
    return () => unsubscribeAuth(); 
  }, []);

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

  const fetchLikedMealsData = async (userId: string) => {
    setIsLoadingMyMeals(true);
    try {
      const likedMealsRef = collection(db, `users/${userId}/likedMeals`);
      const q = query(likedMealsRef, orderBy('likedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const mealsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as LikedMeal[];
      setLikedMeals(mealsData);
    } catch (error) {
      console.error("Error fetching liked meals:", error);
      setLikedMeals([]); 
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถโหลด 'มื้ออาหารของฉัน' ได้",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMyMeals(false);
    }
  };
  
  useEffect(() => {
    if (currentUser?.uid) {
      fetchLikedMealsData(currentUser.uid);
    } else {
      setLikedMeals([]); 
      setIsLoadingMyMeals(false);
    }
  }, [currentUser]);


  useEffect(() => {
    const checkIfLiked = async () => {
      if (currentUser && imageAnalysisResult && previewUrl && isFoodIdentified) {
        setIsLiking(true); // Indicate loading for button state
        try {
          const likedMealsRef = collection(db, `users/${currentUser.uid}/likedMeals`);
          const q = query(likedMealsRef, 
            where("imageUrl", "==", previewUrl), 
            where("foodName", "==", imageAnalysisResult.foodItem)
          );
          const querySnapshot = await getDocs(q);
          setIsAlreadyLiked(!querySnapshot.empty);
        } catch (error) {
          console.error("Error checking if meal is liked:", error);
          setIsAlreadyLiked(false); 
        } finally {
          setIsLiking(false);
        }
      } else {
        setIsAlreadyLiked(false);
      }
    };
    checkIfLiked();
  }, [currentUser, imageAnalysisResult, previewUrl, isFoodIdentified]);


  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "ออกจากระบบสำเร็จ",
      });
      // resetState is called by onAuthStateChanged
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
    setIsLiking(false);
    setIsAlreadyLiked(false);
    // setLikedMeals([]); // Keep likedMeals if user is still logged in, onAuthStateChanged handles full reset
    // setIsMyMealsDialogOpen(false); // Dialog state should persist unless explicitly closed
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
      setIsAlreadyLiked(false); // Reset for new image
    }
  };

  const handleImageAnalysis = async () => {
    if (!selectedFile) {
      setImageError('โปรดเลือกไฟล์รูปภาพก่อน');
      return;
    }
    setIsLoadingImageAnalysis(true);
    setImageError(null);
    setIsAlreadyLiked(false); // Reset for new analysis
    
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

  const handleLikeMeal = async () => {
    if (!currentUser || !imageAnalysisResult || !previewUrl || !isFoodIdentified) {
      toast({
        title: "ไม่สามารถถูกใจได้",
        description: "ต้องเข้าสู่ระบบและมีผลการวิเคราะห์อาหารก่อน",
        variant: "destructive",
      });
      return;
    }

    setIsLiking(true);
    try {
      // Stronger check: Query Firestore directly to ensure the item isn't already liked
      const likedMealsRef = collection(db, `users/${currentUser.uid}/likedMeals`);
      const q = query(likedMealsRef, 
        where("imageUrl", "==", previewUrl), 
        where("foodName", "==", imageAnalysisResult.foodItem)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        toast({
          title: "ถูกใจแล้ว",
          description: "คุณได้ถูกใจรายการอาหารนี้แล้ว",
        });
        setIsAlreadyLiked(true); // Ensure UI is consistent
        setIsLiking(false);
        return;
      }

      // If not already liked, proceed to add
      await addDoc(likedMealsRef, {
        foodName: imageAnalysisResult.foodItem,
        imageUrl: previewUrl, 
        likedAt: serverTimestamp(),
        userId: currentUser.uid, 
      });
      
      toast({
        title: "ถูกใจสำเร็จ!",
        description: `${imageAnalysisResult.foodItem} ถูกเพิ่มใน \"มื้ออาหารของฉัน\" แล้ว`,
      });
      setIsAlreadyLiked(true); // Optimistic UI update for the button
      
      // Re-fetch liked meals to update the "My Meals" dialog
      if (currentUser?.uid) {
        fetchLikedMealsData(currentUser.uid);
      }

    } catch (error) {
      console.error("Error liking meal:", error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถบันทึกการถูกใจได้ โปรดลองอีกครั้ง",
        variant: "destructive",
      });
    } finally {
      setIsLiking(false);
    }
  };


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
                     <DropdownMenuItem
                        onClick={() => {
                          if (currentUser) {
                            setIsMyMealsDialogOpen(true);
                            if(currentUser?.uid) fetchLikedMealsData(currentUser.uid); // Refresh data when opening
                          } else {
                            toast({ title: "กรุณาเข้าสู่ระบบ", description: "เพื่อดูมื้ออาหารของคุณ" });
                          }
                        }}
                        className="flex items-center w-full cursor-pointer"
                      >
                        <ChefHat className="mr-2 h-4 w-4" />
                        <span>มื้ออาหารของฉัน</span>
                      </DropdownMenuItem>
                    <DropdownMenuSeparator />
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

        <PageSection title="อาหารอะไรที่อยู่บนจานของคุณ? 🤔🍽️" icon={<Brain />} id="image-scanner" className="bg-secondary/30 rounded-lg shadow-md" titleBgColor="bg-primary" titleTextColor="text-primary-foreground">
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
                <div className="mt-6 mb-6 flex flex-col items-center space-y-4 md:flex-row md:items-start md:justify-center md:space-y-0 md:space-x-8 border border-dashed border-border p-6 rounded-lg bg-card shadow-sm">
                  <div className="flex-shrink-0 text-center">
                    <p className="text-sm font-body mb-2 text-muted-foreground">ตัวอย่างรูปภาพ:</p>
                    <Image src={previewUrl} alt="Food preview" width={240} height={240} className="rounded-lg shadow-md object-contain max-h-56 mx-auto" data-ai-hint="food meal" />
                  </div>

                  {currentUser && imageAnalysisResult && isFoodIdentified && (
                    <div className="flex-shrink-0 self-center md:pt-10">
                      <Button
                        onClick={handleLikeMeal}
                        disabled={isLiking} // Only disable when isLiking is true, isAlreadyLiked controls appearance
                        className={`
                          flex items-center justify-center text-base font-medium py-3 px-6 rounded-lg shadow-md transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2
                          ${isLiking 
                            ? 'bg-pink-400 text-white cursor-wait' 
                            : isAlreadyLiked 
                              ? 'bg-pink-200 text-pink-600 cursor-not-allowed hover:bg-pink-200'
                              : 'bg-pink-500 text-white hover:bg-pink-600 focus:ring-pink-500 active:bg-pink-700'
                          }
                        `}
                        aria-live="polite"
                      >
                        {isLiking && !isAlreadyLiked ? ( // Show loader only when liking and not already liked
                          <Loader2 className="animate-spin mr-2 h-5 w-5" />
                        ) : (
                          <Heart 
                            className={`mr-2 h-5 w-5 
                              ${isAlreadyLiked ? 'fill-pink-600 text-pink-600' : 'text-white'}
                            `} 
                          />
                        )}
                        {isAlreadyLiked ? "ถูกใจแล้ว" : "ถูกใจมื้อนี้"}
                      </Button>
                    </div>
                  )}
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

      </main>

      {/* My Meals Dialog */}
      <Dialog open={isMyMealsDialogOpen} onOpenChange={setIsMyMealsDialogOpen}>
        <DialogContent className="max-w-3xl min-h-[70vh] flex flex-col sm:max-w-2xl md:max-w-3xl"> {/* Responsive max-width */}
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline text-primary flex items-center">
              <ChefHat className="w-7 h-7 mr-2" />
              มื้ออาหารของฉัน
            </DialogTitle>
            <DialogDescription>
              รายการอาหารที่คุณกดถูกใจไว้
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-hidden py-4">
            <ScrollArea className="h-full pr-4"> {/* Added pr-4 for scrollbar spacing */}
              {isLoadingMyMeals ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-1"> {/* Fewer columns for dialog */}
                  {[...Array(4)].map((_, index) => ( // Show more skeletons if needed
                    <Card key={index} className="shadow-md rounded-lg overflow-hidden">
                      <CardHeader className="p-0">
                        <Skeleton className="h-32 w-full" /> {/* Smaller skeleton height */}
                      </CardHeader>
                      <CardContent className="p-3 space-y-1">
                        <Skeleton className="h-5 w-3/4 rounded" />
                        <Skeleton className="h-3 w-1/2 rounded" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : likedMeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <Info className="w-12 h-12 text-primary mb-3" /> {/* Smaller icon */}
                  <p className="text-lg font-semibold text-foreground">ยังไม่มีมื้ออาหารที่ถูกใจ</p>
                  <p className="text-sm text-muted-foreground">
                    เมื่อคุณกดถูกใจมื้ออาหารที่สแกนแล้ว รายการจะแสดงที่นี่ค่ะ
                  </p>
                  <Button onClick={() => setIsMyMealsDialogOpen(false)} className="mt-4 text-sm" size="sm">
                    <Utensils className="mr-2 h-4 w-4" /> ไปสแกนอาหาร
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-1"> {/* Fewer columns for dialog */}
                  {likedMeals.map((meal) => (
                    <Card key={meal.id} className="shadow-md rounded-xl overflow-hidden flex flex-col bg-card hover:shadow-lg transition-shadow duration-300">
                      <CardHeader className="p-0 relative">
                        {meal.imageUrl ? (
                          <Image
                            src={meal.imageUrl}
                            alt={meal.foodName}
                            width={250} 
                            height={160} 
                            className="object-cover w-full h-32 md:h-40 rounded-t-xl" 
                            data-ai-hint="food meal"
                          />
                        ) : (
                          <div className="w-full h-32 md:h-40 rounded-t-xl bg-muted flex items-center justify-center">
                            <Utensils className="w-10 h-10 text-muted-foreground" />
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="p-3 flex-grow flex flex-col justify-between">
                        <div>
                          <CardTitle className="text-md font-headline text-primary mb-1 truncate" title={meal.foodName}>
                            {meal.foodName}
                          </CardTitle>
                          <CardDescription className="text-xs text-muted-foreground flex items-center">
                            <CalendarDays className="w-3 h-3 mr-1.5" />
                            ถูกใจเมื่อ: {formatDate(meal.likedAt)}
                          </CardDescription>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter className="mt-auto pt-4 border-t">
            <Button variant="outline" onClick={() => setIsMyMealsDialogOpen(false)}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <footer className="text-center py-8 mt-12 md:mt-16 border-t border-border/50">
        <p className="text-muted-foreground font-body">&copy; {new Date().getFullYear()} FSFA (Food Security For All) สงวนลิขสิทธิ์</p>
      </footer>
    </div>
  );
}
    

    

    
