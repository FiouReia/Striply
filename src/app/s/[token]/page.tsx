import { GuestShare } from "@/features/cloud/guest-pages";
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){return <GuestShare token={(await params).token} />;}
