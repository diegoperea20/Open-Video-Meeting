'use client';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { Input, Button, IconButton } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import '@/app/styles/Home.css';

export default function Home() {
  const [url, setUrl] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Verificamos si estamos en el entorno cliente
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      // Registramos el Service Worker en el cliente
      import('../../public/serviceWorker.js').then(module => {
        module.register();
      });
    }
  }, []);

  const handleChange = (e) => setUrl(e.target.value);

  const join = () => {
    if (url !== "") {
      const urlParts = url.split("/");
      router.push(`/${urlParts[urlParts.length - 1]}`);
    } else {
      const randomUrl = Math.random().toString(36).substring(2, 7);
      router.push(`/${randomUrl}`);
    }
  };

  return (
    <div className="container2">
      <div style={{ fontSize: "14px",  background: "#232323", width: "10%", textAlign: "center", margin: "auto", marginBottom: "10px", color : "#9ca3af" ,borderRadius: '0.5rem',cursor: 'pointer'}}>
        Source code:
        <IconButton style={{ color: "white" }} onClick={() => window.location.href = "https://github.com/diegoperea20"}>
          <GitHubIcon />
        </IconButton>
      </div>

      <div>
        <h1 style={{ fontSize: "45px", color: "#ffffff", }}>Open Video Meeting</h1>
        <p style={{ fontSize: '1.25rem',color: '#9ca3af', marginBottom: '2rem'}}>Video conference website open with alls</p>
      </div>
      <div style={{
        background: "#232323", width: "30%", height: "auto", padding: "20px", minWidth: "400px",borderRadius: '0.5rem',
        textAlign: "center", margin: "auto", marginTop: "100px"
      }}>
        <p style={{ margin: 0, fontWeight: "600", paddingRight: "50px" ,color: 'white'}}>Start or join a meeting</p>
        <Input  style={{ color: "white" }} placeholder="URL" onChange={handleChange} />
        <Button variant="contained" color="primary" onClick={join} style={{ margin: "20px" , fontWeight: "300"}}>Go</Button>
      </div>
    </div>
  );
}
