export type Gender='male'|'female';
export type RelationshipType='parent'|'sibling'|'partner';
export type MaritalStatus='single'|'married'|'divorced'|'widowed'|'separated';
export interface Family{id:string;name:string;rootPersonId:string;createdAt:number;updatedAt:number;}
export interface Person{id:string;familyId:string;firstName:string;middleName?:string;lastName?:string;gender:Gender;birthDate?:string;deathDate?:string;phone?:string;notes?:string;birthPlace?:string;residence?:string;maritalStatus?:MaritalStatus;photoId?:string;createdAt:number;updatedAt:number;}
export interface Relationship{id:string;familyId:string;fromPersonId:string;toPersonId:string;type:RelationshipType;metadata?:{role?:'father'|'mother'|'child'|'sibling';};createdAt:number;}
export interface Marriage{id:string;familyId:string;person1Id:string;person2Id:string;status:'current'|'past';startDate?:string;endDate?:string;order:number;createdAt:number;}
export interface Media{id:string;personId:string;thumbnail:string;detail:string;mimeType:string;size:number;createdAt:number;}
export interface Settings{id:'app';theme:'light'|'dark'|'system';fontScale:number;lastPersonId?:string;}
export interface Backup{version:1;exportedAt:string;families:Family[];people:Person[];relationships:Relationship[];marriages:Marriage[];media:Media[];settings:Settings[];}
export const uid=()=>crypto.randomUUID();
export const fullName=(p:Person)=>[p.firstName,p.middleName,p.lastName].filter(Boolean).join(' ');
